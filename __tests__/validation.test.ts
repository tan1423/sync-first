import { describe, it, expect } from "vitest";
import {
  registerSchema,
  shareSchema,
  pushUpdateSchema,
  createVersionSchema,
} from "@/lib/validation";
import { canWrite } from "@/lib/guards";

// Security-focused tests: the validation layer is a first line of defence
// against malformed / oversized sync payloads (OOM protection) and against
// privilege escalation via the share endpoint.

describe("payload validation (OOM / abuse guards)", () => {
  it("rejects an oversized sync update payload", () => {
    const huge = "A".repeat(2_000_001); // exceeds the 2MB base64 cap
    expect(pushUpdateSchema.safeParse({ update: huge }).success).toBe(false);
  });

  it("accepts a reasonable sync update payload", () => {
    expect(pushUpdateSchema.safeParse({ update: "aGVsbG8=" }).success).toBe(true);
  });

  it("rejects an oversized version snapshot", () => {
    const huge = "A".repeat(4_000_001);
    expect(createVersionSchema.safeParse({ label: "x", snapshot: huge }).success).toBe(false);
  });

  it("rejects a registration with a short password", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", name: "A", password: "short" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = registerSchema.safeParse({ email: "not-an-email", name: "A", password: "longenough" });
    expect(r.success).toBe(false);
  });
});

describe("authorization rules", () => {
  it("share endpoint cannot grant OWNER (no privilege escalation)", () => {
    // OWNER is not an allowed value in the share schema enum.
    expect(shareSchema.safeParse({ email: "a@b.com", role: "OWNER" }).success).toBe(false);
    expect(shareSchema.safeParse({ email: "a@b.com", role: "EDITOR" }).success).toBe(true);
    expect(shareSchema.safeParse({ email: "a@b.com", role: "VIEWER" }).success).toBe(true);
  });

  it("viewers cannot write; editors and owners can", () => {
    expect(canWrite("VIEWER")).toBe(false);
    expect(canWrite("EDITOR")).toBe(true);
    expect(canWrite("OWNER")).toBe(true);
  });
});
