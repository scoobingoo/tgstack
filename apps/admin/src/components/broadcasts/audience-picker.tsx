"use client";

import { useQuery } from "@tanstack/react-query";
import { LOCALE_LABELS, type Locale, SUPPORTED_LOCALES, type Translate } from "@tgstack/i18n";
import type { BroadcastSegment } from "@tgstack/shared";
import { UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Activity = "any" | "active" | "inactive";
type Purchases = "any" | "buyers" | "non-buyers";

/** Form state of the picker; `toSegment` turns it into the API's segment. */
export interface AudienceForm {
  locales: Locale[];
  activity: Activity;
  days: string;
  purchases: Purchases;
}

export function audienceFormFrom(segment: BroadcastSegment | null | undefined): AudienceForm {
  return {
    locales: segment?.locales ?? [],
    activity: segment?.activeWithinDays ? "active" : segment?.inactiveForDays ? "inactive" : "any",
    days: String(segment?.activeWithinDays ?? segment?.inactiveForDays ?? 30),
    purchases: segment?.purchases ?? "any",
  };
}

/** `null` when no condition is set: everyone who did not block the bot. */
export function toSegment(form: AudienceForm): BroadcastSegment | null {
  const segment: BroadcastSegment = {};
  if (form.locales.length > 0) segment.locales = form.locales;
  const days = Number.parseInt(form.days, 10);
  if (form.activity === "active") segment.activeWithinDays = days;
  if (form.activity === "inactive") segment.inactiveForDays = days;
  if (form.purchases !== "any") segment.purchases = form.purchases;
  return Object.keys(segment).length > 0 ? segment : null;
}

/** One line per condition, for read-only views. */
export function describeSegment(segment: BroadcastSegment | null, t: Translate): string[] {
  if (!segment) return [t("audience-everyone")];
  const lines: string[] = [];
  if (segment.locales) {
    lines.push(
      t("audience-summary-locales", {
        locales: segment.locales.map((locale) => LOCALE_LABELS[locale].label).join(", "),
      }),
    );
  }
  if (segment.activeWithinDays) {
    lines.push(t("audience-summary-active", { days: segment.activeWithinDays }));
  }
  if (segment.inactiveForDays) {
    lines.push(t("audience-summary-inactive", { days: segment.inactiveForDays }));
  }
  if (segment.purchases) lines.push(t(`audience-purchases-${segment.purchases}`));
  return lines;
}

/** Live recipient count for a segment (debounced). */
export function AudienceEstimate({ segment }: { segment: BroadcastSegment | null }) {
  const { t, locale } = useI18n();
  const debounced = useDebouncedValue(segment, 400);
  const count = useQuery({
    queryKey: ["broadcasts", "audience", debounced],
    queryFn: () => api.broadcasts.audience(debounced),
    // The form may be mid-edit (e.g. empty "days"); keep the last valid count.
    retry: false,
    placeholderData: (previous) => previous,
  });
  return (
    // A span, so it can sit inside dialog descriptions (which are paragraphs).
    <span className="flex items-center gap-2 text-sm" aria-live="polite">
      <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
      {count.data
        ? t("audience-estimate", {
            count: count.data.count,
            formatted: formatNumber(count.data.count, locale),
          })
        : count.isError
          ? t("audience-estimate-invalid")
          : t("loading")}
    </span>
  );
}

/** Who receives the broadcast. Conditions combine; nothing selected means everyone. */
export function AudiencePicker({
  value,
  onChange,
  error,
}: {
  value: AudienceForm;
  onChange: (next: AudienceForm) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const set = <K extends keyof AudienceForm>(key: K, next: AudienceForm[K]) =>
    onChange({ ...value, [key]: next });
  const toggleLocale = (locale: Locale) =>
    set(
      "locales",
      value.locales.includes(locale)
        ? value.locales.filter((item) => item !== locale)
        : [...value.locales, locale],
    );

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("audience-languages")}</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_LOCALES.map((locale) => {
            const selected = value.locales.includes(locale);
            return (
              <Button
                key={locale}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                onClick={() => toggleLocale(locale)}
              >
                <span aria-hidden>{LOCALE_LABELS[locale].flag}</span>
                {LOCALE_LABELS[locale].label}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("audience-languages-help")}</p>
      </fieldset>

      <div className="grid gap-4 2xl:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="audience-activity">{t("audience-activity")}</Label>
          <div className="flex gap-2">
            <Select
              value={value.activity}
              onValueChange={(next) => set("activity", next as Activity)}
            >
              <SelectTrigger id="audience-activity" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("audience-activity-any")}</SelectItem>
                <SelectItem value="active">{t("audience-activity-active")}</SelectItem>
                <SelectItem value="inactive">{t("audience-activity-inactive")}</SelectItem>
              </SelectContent>
            </Select>
            {value.activity !== "any" ? (
              <Input
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                className="w-24"
                aria-label={t("audience-days")}
                value={value.days}
                onChange={(event) => set("days", event.target.value)}
              />
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="audience-purchases">{t("audience-purchases")}</Label>
          <Select
            value={value.purchases}
            onValueChange={(next) => set("purchases", next as Purchases)}
          >
            <SelectTrigger id="audience-purchases" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("audience-purchases-any")}</SelectItem>
              <SelectItem value="buyers">{t("audience-purchases-buyers")}</SelectItem>
              <SelectItem value="non-buyers">{t("audience-purchases-non-buyers")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <AudienceEstimate segment={toSegment(value)} />
      <p className="text-xs text-muted-foreground">{t("audience-help")}</p>
    </div>
  );
}
