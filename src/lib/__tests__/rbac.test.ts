import { describe, it, expect } from "vitest";
import { hasFeature } from "../rbac";

describe("hasFeature", () => {
  it("returns true when the feature is present", () => {
    expect(hasFeature(["vulnerabilities", "runtime_alerts"], "vulnerabilities")).toBe(true);
  });

  it("returns false when the feature is absent", () => {
    expect(hasFeature(["vulnerabilities"], "runtime_alerts")).toBe(false);
  });

  it("returns false for an empty feature list", () => {
    expect(hasFeature([], "vulnerabilities")).toBe(false);
  });
});
