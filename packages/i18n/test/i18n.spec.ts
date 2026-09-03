import { describe, expect, it } from "vitest";
import {
  createTranslator,
  getMessageIds,
  type Namespace,
  negotiateLocale,
  resources,
  SUPPORTED_LOCALES,
  toSupportedLocale,
} from "../src/index.js";

describe("locale negotiation", () => {
  it("prefers the first supported candidate", () => {
    expect(negotiateLocale("vi", "en")).toBe("vi");
    expect(negotiateLocale(undefined, "vi-VN")).toBe("vi");
    expect(negotiateLocale(null, "de", "EN_us")).toBe("en");
  });

  it("falls back to English", () => {
    expect(negotiateLocale()).toBe("en");
    expect(negotiateLocale("fr", "ja")).toBe("en");
    expect(negotiateLocale("", undefined)).toBe("en");
  });

  it("normalises language tags", () => {
    expect(toSupportedLocale(" VI ")).toBe("vi");
    expect(toSupportedLocale("pt-BR")).toBeUndefined();
  });
});

describe("translations", () => {
  const namespaces = Object.keys(resources.en) as Namespace[];

  it.each(namespaces)("%s: every locale defines the same message IDs", (namespace) => {
    const reference = getMessageIds("en", namespace).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect(getMessageIds(locale, namespace).sort(), `${locale}/${namespace}.ftl`).toEqual(
        reference,
      );
    }
  });

  it("formats variables without isolation marks", () => {
    const t = createTranslator("en", "bot");
    expect(t("onboarding-saved", { name: "Ada" })).toBe(
      "🎉 All set, Ada! Your profile has been saved.",
    );
    expect(createTranslator("vi", "bot")("cancel-done")).toBe("Đã huỷ.");
  });

  it("returns the key for unknown messages", () => {
    expect(createTranslator("vi", "bot")("does-not-exist")).toBe("does-not-exist");
  });
});
