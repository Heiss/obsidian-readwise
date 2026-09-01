import { describe, it, expect } from "vitest";
import { isValidSecretId, TOKEN_SECRET_ID } from "../src/core/secretId";

describe("isValidSecretId", () => {
  it("accepts lowercase letters, digits and hyphens", () => {
    expect(isValidSecretId("linkwarden-token")).toBe(true);
    expect(isValidSecretId("abc123")).toBe(true);
    expect(isValidSecretId("a-b-c")).toBe(true);
    expect(isValidSecretId("---")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidSecretId("")).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(isValidSecretId("Linkwarden")).toBe(false);
  });

  it("rejects spaces, underscores and other punctuation", () => {
    expect(isValidSecretId("a b")).toBe(false);
    expect(isValidSecretId("a_b")).toBe(false);
    expect(isValidSecretId("a.b")).toBe(false);
    expect(isValidSecretId("a*b")).toBe(false);
  });
});

describe("TOKEN_SECRET_ID", () => {
  it("is itself a valid secret id", () => {
    expect(isValidSecretId(TOKEN_SECRET_ID)).toBe(true);
  });
});
