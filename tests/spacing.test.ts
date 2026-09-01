import { describe, it, expect } from "vitest";
import { blockSeparatorBefore, blockSeparatorAfter } from "../src/core/quote";

describe("blockSeparatorBefore", () => {
  it("adds nothing at the very start of the document", () => {
    expect(blockSeparatorBefore("")).toBe("");
  });

  it("ends the current line and adds a blank line when mid-line", () => {
    expect(blockSeparatorBefore("some text")).toBe("\n\n");
  });

  it("adds a blank line when cursor is mid-document mid-line", () => {
    expect(blockSeparatorBefore("a\nsome text")).toBe("\n\n");
  });

  it("adds one newline on a fresh line whose predecessor has content", () => {
    expect(blockSeparatorBefore("text\n")).toBe("\n");
  });

  it("adds nothing when already blank-line separated", () => {
    expect(blockSeparatorBefore("text\n\n")).toBe("");
  });

  it("separates from a callout directly above the cursor (the reported bug)", () => {
    // Cursor on the empty line right below a callout's last line.
    expect(blockSeparatorBefore("> **Note:** thought ^lw-1573\n")).toBe("\n");
  });

  it("treats a whitespace-only previous line as blank", () => {
    expect(blockSeparatorBefore("text\n   \n")).toBe("");
  });
});

describe("blockSeparatorAfter", () => {
  it("ends the block with a newline at end of document", () => {
    expect(blockSeparatorAfter("")).toBe("\n");
  });

  it("uses the existing newline when the cursor is at end of a line", () => {
    expect(blockSeparatorAfter("\nmore")).toBe("\n");
  });

  it("forces a blank line when content butts up against the block", () => {
    expect(blockSeparatorAfter("more text")).toBe("\n\n");
  });

  it("is fine when a blank line already follows", () => {
    expect(blockSeparatorAfter("\n\nmore")).toBe("\n");
  });
});
