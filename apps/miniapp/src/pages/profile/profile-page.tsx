import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LOCALE_LABELS, type Locale, SUPPORTED_LOCALES } from "@tgstack/i18n";
import { useApp } from "../../app/app-context";
import { Section, Spinner, Toast } from "../../components/ui";

export function ProfilePage() {
  const { api, me, locale, t } = useApp();
  const queryClient = useQueryClient();
  const setLocale = useMutation({
    mutationFn: (next: Locale) => api.updateMe({ locale: next }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (!me) return <Spinner label={t("loading")} />;
  const initials = me.firstName.slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
        <div
          aria-hidden
          className="flex size-20 items-center justify-center rounded-full bg-tg-button text-3xl font-semibold text-tg-button-text"
        >
          {initials}
        </div>
        <h1 className="text-xl font-semibold">
          {[me.firstName, me.lastName].filter(Boolean).join(" ")}
        </h1>
        {me.username ? <p className="text-sm text-tg-hint">@{me.username}</p> : null}
      </div>

      <Section>
        <div className="flex items-center justify-between px-4 py-3">
          <span>{t("profile-telegram-id")}</span>
          <span className="font-mono text-sm text-tg-hint">{me.telegramId}</span>
        </div>
      </Section>

      <Section title={t("profile-language")} footer={t("profile-language-hint")}>
        <fieldset className="divide-y divide-tg-separator" aria-label={t("profile-language")}>
          {SUPPORTED_LOCALES.map((code) => (
            <label
              key={code}
              className="flex cursor-pointer items-center justify-between px-4 py-3"
            >
              <span>
                {LOCALE_LABELS[code].flag} {LOCALE_LABELS[code].label}
              </span>
              <input
                type="radio"
                name="locale"
                value={code}
                className="size-5 accent-tg-button"
                checked={locale === code}
                disabled={setLocale.isPending}
                onChange={() => setLocale.mutate(code)}
              />
            </label>
          ))}
        </fieldset>
      </Section>
      {setLocale.isSuccess ? <Toast>{t("profile-language-saved")}</Toast> : null}
      {setLocale.isError ? <Toast tone="error">{t("error-generic")}</Toast> : null}

      {me.onboarding ? (
        // EXAMPLE: answers of the bot's onboarding wizard.
        <Section title={t("profile-onboarding")}>
          <pre className="overflow-x-auto px-4 py-3 text-xs text-tg-hint">
            {JSON.stringify(me.onboarding, null, 2)}
          </pre>
        </Section>
      ) : null}
    </div>
  );
}
