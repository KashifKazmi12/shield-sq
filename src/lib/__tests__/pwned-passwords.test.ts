import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "crypto";
import { checkPasswordPwned } from "../pwned-passwords";

describe("checkPasswordPwned", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports pwned:true with the count when the suffix is in the range response", async () => {
    const password = "password123";
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const suffix = sha1.slice(5);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => `${suffix}:42\nDEADBEEF00000000000000000000000000:1` })
    );

    const result = await checkPasswordPwned(password);
    expect(result).toEqual({ pwned: true, count: 42 });
  });

  it("reports pwned:false when the suffix isn't in the range response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5" }));
    const result = await checkPasswordPwned("some-unrelated-password");
    expect(result).toEqual({ pwned: false, count: 0 });
  });

  it("returns null (unknown) on a non-OK response rather than false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }));
    const result = await checkPasswordPwned("whatever");
    expect(result).toBeNull();
  });

  it("returns null (unknown) on a network error rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await checkPasswordPwned("whatever");
    expect(result).toBeNull();
  });

  it("never sends the full password hash, only a 5-char prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await checkPasswordPwned("hunter2");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const prefix = calledUrl.split("/").pop()!;
    expect(prefix).toHaveLength(5);
  });
});
