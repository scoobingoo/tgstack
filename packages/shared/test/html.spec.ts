import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/index.js";

describe("escapeHtml", () => {
  it("escapes the characters Telegram's HTML parser cares about", () => {
    expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;",
    );
  });

  it("leaves other text untouched", () => {
    expect(escapeHtml("Xin chào 👋 it's fine")).toBe("Xin chào 👋 it's fine");
  });
});
