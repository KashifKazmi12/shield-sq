import { describe, it, expect } from "vitest";
import { statusBucket } from "../url-monitoring-queries";

describe("statusBucket", () => {
  it("buckets null as unreachable", () => {
    expect(statusBucket(null)).toBe("unreachable");
  });

  it("buckets 2xx codes", () => {
    expect(statusBucket(200)).toBe("2xx");
    expect(statusBucket(299)).toBe("2xx");
  });

  it("buckets 3xx codes", () => {
    expect(statusBucket(301)).toBe("3xx");
    expect(statusBucket(399)).toBe("3xx");
  });

  it("buckets 4xx codes", () => {
    expect(statusBucket(404)).toBe("4xx");
    expect(statusBucket(499)).toBe("4xx");
  });

  it("buckets 5xx and anything above as 5xx", () => {
    expect(statusBucket(500)).toBe("5xx");
    expect(statusBucket(599)).toBe("5xx");
    expect(statusBucket(600)).toBe("5xx");
  });

  it("treats informational (sub-200) codes as unreachable", () => {
    expect(statusBucket(100)).toBe("unreachable");
  });
});
