import { describe, it, expect, vi, beforeEach } from "vitest";

const qboQuery = vi.fn();
const qboPost = vi.fn();

vi.mock("@/lib/qbo/client", () => ({
  qboQuery: (...args: unknown[]) => qboQuery(...args),
  qboPost: (...args: unknown[]) => qboPost(...args),
}));

import { ensureSubCustomer } from "@/lib/qbo/invoice";

describe("ensureSubCustomer", () => {
  beforeEach(() => {
    qboQuery.mockReset();
    qboPost.mockReset();
  });

  it("reuses the existing sub-customer when the parent matches and BillWithParent is already set", async () => {
    qboQuery.mockResolvedValueOnce({
      QueryResponse: {
        Customer: [
          {
            Id: "42",
            DisplayName: "ISS:Ari Amir",
            ParentRef: { value: "parent-iss" },
            SyncToken: "3",
            BillWithParent: true,
          },
        ],
      },
    });

    const result = await ensureSubCustomer("Ari Amir", "parent-iss", "ISS");

    expect(result).toEqual({ id: "42", disambiguated: false });
    expect(qboPost).not.toHaveBeenCalled();
  });

  it("backfills BillWithParent on an existing sub-customer that predates the flag", async () => {
    qboQuery.mockResolvedValueOnce({
      QueryResponse: {
        Customer: [
          {
            Id: "42",
            DisplayName: "ISS:Ari Amir",
            ParentRef: { value: "parent-iss" },
            SyncToken: "3",
            BillWithParent: false,
          },
        ],
      },
    });
    qboPost.mockResolvedValueOnce({});

    const result = await ensureSubCustomer("Ari Amir", "parent-iss", "ISS");

    expect(result).toEqual({ id: "42", disambiguated: false });
    expect(qboPost).toHaveBeenCalledWith("customer", {
      Id: "42",
      SyncToken: "3",
      sparse: true,
      BillWithParent: true,
    });
  });

  it("creates a new sub-customer when none exists", async () => {
    qboQuery.mockResolvedValueOnce({ QueryResponse: {} });
    qboPost.mockResolvedValueOnce({ Customer: { Id: "99" } });

    const result = await ensureSubCustomer("Ari Amir", "parent-iss", "ISS");

    expect(result).toEqual({ id: "99", disambiguated: false });
    expect(qboPost).toHaveBeenCalledWith("customer", {
      DisplayName: "Ari Amir",
      ParentRef: { value: "parent-iss" },
      Job: true,
      BillWithParent: true,
    });
  });

  it("disambiguates when the same name exists under a different parent", async () => {
    // First query: name-suffix match finds a customer under a DIFFERENT parent.
    qboQuery.mockResolvedValueOnce({
      QueryResponse: {
        Customer: [
          { Id: "1", DisplayName: "CMS:Ari Amir", ParentRef: { value: "parent-cms" }, SyncToken: "1" },
        ],
      },
    });
    // Second query: look up the disambiguated name — none exists yet.
    qboQuery.mockResolvedValueOnce({ QueryResponse: {} });
    qboPost.mockResolvedValueOnce({ Customer: { Id: "77" } });

    const result = await ensureSubCustomer("Ari Amir", "parent-iss", "ISS");

    expect(result).toEqual({ id: "77", disambiguated: true });
    expect(qboPost).toHaveBeenCalledWith("customer", {
      DisplayName: "Ari Amir (ISS)",
      ParentRef: { value: "parent-iss" },
      Job: true,
      BillWithParent: true,
    });
  });

  it("reuses an already-disambiguated sub-customer on a repeat collision", async () => {
    qboQuery.mockResolvedValueOnce({
      QueryResponse: {
        Customer: [
          { Id: "1", DisplayName: "CMS:Ari Amir", ParentRef: { value: "parent-cms" }, SyncToken: "1" },
        ],
      },
    });
    qboQuery.mockResolvedValueOnce({
      QueryResponse: {
        Customer: [
          {
            Id: "77",
            DisplayName: "ISS:Ari Amir (ISS)",
            ParentRef: { value: "parent-iss" },
            SyncToken: "2",
            BillWithParent: true,
          },
        ],
      },
    });

    const result = await ensureSubCustomer("Ari Amir", "parent-iss", "ISS");

    expect(result).toEqual({ id: "77", disambiguated: true });
    expect(qboPost).not.toHaveBeenCalled();
  });
});
