import { describe, it, expect } from "vitest";
import { readJsonWithLimit, PayloadTooLargeError } from "../ingest-auth";

function requestWithBody(body: string): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  // @ts-expect-error - undici's Request requires duplex for a streamed body
  return new Request("http://localhost/ingest", { method: "POST", body: stream, duplex: "half" });
}

describe("readJsonWithLimit", () => {
  it("parses a body under the limit", async () => {
    const result = await readJsonWithLimit(requestWithBody(JSON.stringify({ rule: "ok" })), 1024);
    expect(result).toEqual({ rule: "ok" });
  });

  it("rejects a body that exceeds the limit as it streams in, regardless of Content-Length", async () => {
    const bigBody = JSON.stringify({ data: "x".repeat(1000) });
    await expect(readJsonWithLimit(requestWithBody(bigBody), 100)).rejects.toThrow(PayloadTooLargeError);
  });
});
