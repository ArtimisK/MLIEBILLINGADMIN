import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    drive: () => ({ files: { get: getMock } }),
  },
}));
vi.mock("@/lib/google/calendar", () => ({
  getOAuthClient: () => ({}),
}));

import { driveFileExists } from "@/lib/drive/upload";

describe("driveFileExists", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("returns true when the file is found", async () => {
    getMock.mockResolvedValueOnce({ data: { id: "abc" } });
    expect(await driveFileExists("abc")).toBe(true);
  });

  it("returns false on a 404 (file genuinely gone)", async () => {
    getMock.mockRejectedValueOnce({ code: 404 });
    expect(await driveFileExists("abc")).toBe(false);
  });

  it("returns false on a 404 reported via response.status instead of code", async () => {
    getMock.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await driveFileExists("abc")).toBe(false);
  });

  it("re-throws a non-404 error instead of reporting the file as missing", async () => {
    getMock.mockRejectedValueOnce({ code: 500, message: "server error" });
    await expect(driveFileExists("abc")).rejects.toBeTruthy();
  });
});
