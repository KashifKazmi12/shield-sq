import { describe, it, expect } from "vitest";
import {
  parseFalcoPayload,
  parseFalcoBatch,
  falcoDedupeKey,
  falcoBucketStart,
  falcoScanIdempotencyKey,
  extractResource,
  FalcoPayloadError,
} from "../falco";

describe("parseFalcoPayload", () => {
  it("accepts a minimal alert with just a rule", () => {
    const alert = parseFalcoPayload({ rule: "Terminal shell in container" });
    expect(alert.rule).toBe("Terminal shell in container");
  });

  it("rejects a payload without a rule field", () => {
    expect(() => parseFalcoPayload({ output: "no rule here" })).toThrow(FalcoPayloadError);
  });
});

describe("parseFalcoBatch", () => {
  it("wraps a single alert object in a one-element array", () => {
    const alerts = parseFalcoBatch({ rule: "Terminal shell in container" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe("Terminal shell in container");
  });

  it("accepts a JSON array of alerts, as some forwarders batch them", () => {
    const alerts = parseFalcoBatch([
      { rule: "Terminal shell in container", priority: "Warning" },
      { rule: "Outbound connection to C2 server", priority: "Critical" },
    ]);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.rule)).toEqual(["Terminal shell in container", "Outbound connection to C2 server"]);
  });

  it("rejects an array containing a malformed alert", () => {
    expect(() => parseFalcoBatch([{ rule: "ok" }, { output: "missing rule" }])).toThrow(FalcoPayloadError);
  });
});

describe("falcoDedupeKey", () => {
  it("uses the alert uuid when present", () => {
    const key = falcoDedupeKey({ rule: "r", uuid: "abc-123" });
    expect(key).toBe("falco:uuid:abc-123");
  });

  it("is deterministic content-hash based when uuid is absent", () => {
    const alert = { rule: "r", output: "o", time: "t" };
    expect(falcoDedupeKey(alert)).toBe(falcoDedupeKey(alert));
  });

  it("differs when rule/output/time differ", () => {
    const a = falcoDedupeKey({ rule: "r1", output: "o", time: "t" });
    const b = falcoDedupeKey({ rule: "r2", output: "o", time: "t" });
    expect(a).not.toBe(b);
  });
});

describe("falco Scan bucketing", () => {
  it("buckets timestamps within the same window to the same start", () => {
    const t1 = new Date("2026-01-01T10:05:00Z");
    const t2 = new Date("2026-01-01T10:55:00Z");
    expect(falcoBucketStart(t1).toISOString()).toBe(falcoBucketStart(t2).toISOString());
  });

  it("buckets timestamps across the hour boundary separately", () => {
    const t1 = new Date("2026-01-01T10:59:00Z");
    const t2 = new Date("2026-01-01T11:01:00Z");
    expect(falcoBucketStart(t1).toISOString()).not.toBe(falcoBucketStart(t2).toISOString());
  });

  it("produces a stable Scan idempotencyKey per (project, bucket)", () => {
    const bucket = falcoBucketStart(new Date("2026-01-01T10:05:00Z"));
    const key1 = falcoScanIdempotencyKey("project-1", bucket);
    const key2 = falcoScanIdempotencyKey("project-1", bucket);
    expect(key1).toBe(key2);
  });

  it("differs across projects for the same bucket", () => {
    const bucket = falcoBucketStart(new Date("2026-01-01T10:05:00Z"));
    expect(falcoScanIdempotencyKey("project-a", bucket)).not.toBe(falcoScanIdempotencyKey("project-b", bucket));
  });
});

describe("extractResource", () => {
  it("joins namespace/pod/container when Kubernetes output_fields are present", () => {
    const resource = extractResource({
      output_fields: {
        "k8s.ns.name": "default",
        "k8s.pod.name": "my-pod",
        "container.name": "my-container",
      },
    });
    expect(resource).toBe("default/my-pod/my-container");
  });

  it("falls back to hostname for a bare-VM Falco deployment with no k8s.* fields", () => {
    // Real shape from a non-Kubernetes, host-based Falco install — no
    // output_fields at all, just a hostname naming where it happened.
    const resource = extractResource({ hostname: "app-vm-01" });
    expect(resource).toBe("app-vm-01");
  });

  it("prefers Kubernetes fields over hostname when both are present", () => {
    const resource = extractResource({
      output_fields: { "k8s.pod.name": "my-pod" },
      hostname: "node-1",
    });
    expect(resource).toBe("my-pod");
  });

  it("returns null when neither output_fields nor hostname are present", () => {
    expect(extractResource({})).toBeNull();
    expect(extractResource({ output_fields: {} })).toBeNull();
  });
});
