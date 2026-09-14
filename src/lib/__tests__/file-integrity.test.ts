import { describe, it, expect } from "vitest";
import {
  parseFileIntegrityBatch,
  fileIntegrityDedupeKey,
  severityForChangeType,
  fileIntegrityBucketStart,
  fileIntegrityScanIdempotencyKey,
  FileIntegrityPayloadError,
} from "../file-integrity";

const alert = { path: "/etc/passwd", changeType: "modified" as const, hostname: "web-1", time: "2026-09-12T10:00:00.000Z" };

describe("parseFileIntegrityBatch", () => {
  it("accepts a single alert object", () => {
    const alerts = parseFileIntegrityBatch(alert);
    expect(alerts).toHaveLength(1);
  });

  it("accepts an array of alerts", () => {
    const alerts = parseFileIntegrityBatch([alert, { ...alert, path: "/etc/shadow" }]);
    expect(alerts).toHaveLength(2);
  });

  it("rejects a payload missing changeType", () => {
    expect(() => parseFileIntegrityBatch({ path: "/etc/passwd" })).toThrow(FileIntegrityPayloadError);
  });
});

describe("severityForChangeType", () => {
  it("ranks removed > modified > added > permissions", () => {
    expect(severityForChangeType("removed")).toBe("critical");
    expect(severityForChangeType("modified")).toBe("high");
    expect(severityForChangeType("added")).toBe("medium");
    expect(severityForChangeType("permissions")).toBe("low");
  });
});

describe("fileIntegrityDedupeKey", () => {
  it("is stable for identical alerts", () => {
    expect(fileIntegrityDedupeKey(alert)).toBe(fileIntegrityDedupeKey({ ...alert }));
  });

  it("differs when the path differs", () => {
    expect(fileIntegrityDedupeKey(alert)).not.toBe(fileIntegrityDedupeKey({ ...alert, path: "/etc/shadow" }));
  });
});

describe("fileIntegrityScanIdempotencyKey", () => {
  it("is the same for two alerts in the same bucket", () => {
    const bucket = fileIntegrityBucketStart(new Date("2026-09-12T10:15:00.000Z"));
    const key1 = fileIntegrityScanIdempotencyKey("project-1", bucket);
    const key2 = fileIntegrityScanIdempotencyKey("project-1", fileIntegrityBucketStart(new Date("2026-09-12T10:45:00.000Z")));
    expect(key1).toBe(key2);
  });
});
