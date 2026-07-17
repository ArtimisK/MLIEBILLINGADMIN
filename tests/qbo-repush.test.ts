import { describe, it, expect, vi, beforeEach } from "vitest";

const qboQuery = vi.fn();
const qboPost = vi.fn();

vi.mock("@/lib/qbo/client", () => ({
  qboQuery: (...args: unknown[]) => qboQuery(...args),
  qboPost: (...args: unknown[]) => qboPost(...args),
}));

import { findInvoiceRefByDocNumber, deleteInvoice } from "@/lib/qbo/invoice";

describe("findInvoiceRefByDocNumber", () => {
  beforeEach(() => {
    qboQuery.mockReset();
    qboPost.mockReset();
  });

  it("returns id + syncToken when an invoice with that DocNumber exists", async () => {
    qboQuery.mockResolvedValueOnce({
      QueryResponse: { Invoice: [{ Id: "6049", SyncToken: "0" }] },
    });

    const result = await findInvoiceRefByDocNumber("11RYM0726");

    expect(result).toEqual({ id: "6049", syncToken: "0" });
  });

  it("returns null when no invoice has that DocNumber", async () => {
    qboQuery.mockResolvedValueOnce({ QueryResponse: {} });

    const result = await findInvoiceRefByDocNumber("99ZZZ9999");

    expect(result).toBeNull();
  });
});

describe("deleteInvoice", () => {
  beforeEach(() => {
    qboQuery.mockReset();
    qboPost.mockReset();
  });

  it("posts a delete operation with the invoice's id and syncToken", async () => {
    qboPost.mockResolvedValueOnce({});

    await deleteInvoice("6049", "0");

    expect(qboPost).toHaveBeenCalledWith(
      "invoice",
      { Id: "6049", SyncToken: "0" },
      { operation: "delete" },
    );
  });
});
