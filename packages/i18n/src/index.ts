import { FluentBundle, FluentResource, type FluentVariable } from "@fluent/bundle";
import { resources } from "./generated/resources.js";

export { resources };

export const SUPPORTED_LOCALES = ["en", "vi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export type Namespace = keyof (typeof resources)[Locale];

/** Native names, shown in language pickers regardless of the current locale. */
export const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇬🇧" },
  vi: { label: "Tiếng Việt", flag: "🇻🇳" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Maps a language tag ("vi", "vi-VN", "EN_us") to a supported locale, or `undefined`.
 */
export function toSupportedLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : undefined;
}

/**
 * Picks the first supported locale among the candidates, in order, falling back
 * to {@link DEFAULT_LOCALE}. The bot calls it with `[user.locale, from.language_code]`.
 */
export function negotiateLocale(...candidates: (string | null | undefined)[]): Locale {
  for (const candidate of candidates) {
    const locale = toSupportedLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/** Fluent source of one namespace in one locale. */
export function getSource(locale: Locale, namespace: Namespace): string {
  return resources[locale][namespace];
}

export type TranslationVariables = Record<string, FluentVariable>;
export type Translate = (key: string, variables?: TranslationVariables) => string;

const bundles = new Map<string, FluentBundle>();

function getBundle(locale: Locale, namespace: Namespace): FluentBundle {
  const cacheKey = `${locale}:${namespace}`;
  let bundle = bundles.get(cacheKey);
  if (!bundle) {
    // useIsolating=false: no invisible Unicode isolation marks around variables,
    // which would otherwise end up inside URLs, commands and copy-pasted text.
    bundle = new FluentBundle(locale, { useIsolating: false });
    const errors = bundle.addResource(new FluentResource(getSource(locale, namespace)));
    if (errors.length > 0) {
      throw new Error(`Invalid Fluent syntax in ${locale}/${namespace}.ftl: ${errors[0]?.message}`);
    }
    bundles.set(cacheKey, bundle);
  }
  return bundle;
}

/**
 * Returns a translate function for a locale and namespace. Missing keys fall back
 * to the default locale, then to the key itself, so a gap never crashes a page.
 */
export function createTranslator(locale: Locale, namespace: Namespace): Translate {
  const bundle = getBundle(locale, namespace);
  const fallback = locale === DEFAULT_LOCALE ? undefined : getBundle(DEFAULT_LOCALE, namespace);
  return (key, variables) => {
    const source = bundle.hasMessage(key)
      ? bundle
      : fallback?.hasMessage(key)
        ? fallback
        : undefined;
    const message = source?.getMessage(key);
    if (!source || !message?.value) return key;
    return source.formatPattern(message.value, variables);
  };
}

/** Message IDs defined in a namespace for a locale (used by the parity test). */
export function getMessageIds(locale: Locale, namespace: Namespace): string[] {
  const resource = new FluentResource(getSource(locale, namespace));
  return resource.body.flatMap((entry) =>
    "id" in entry && !entry.id.startsWith("-") ? [entry.id] : [],
  );
}
