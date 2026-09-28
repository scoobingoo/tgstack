import type { ReactNode } from "react";

/** A Telegram-style grouped list section. */
export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {title ? (
        <h2 className="px-4 text-xs font-medium tracking-wide text-tg-section-header uppercase">
          {title}
        </h2>
      ) : null}
      <div className="overflow-hidden rounded-xl bg-tg-section">{children}</div>
      {footer ? <p className="px-4 text-xs text-tg-hint">{footer}</p> : null}
    </section>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex justify-center p-8">
      <span className="size-6 animate-spin rounded-full border-2 border-tg-hint border-t-transparent" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Toast({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm ${tone === "error" ? "bg-tg-destructive/10 text-tg-destructive" : "bg-tg-section text-tg-text"}`}
    >
      {children}
    </p>
  );
}

export function ErrorView({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-tg-hint">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-tg-button px-4 py-2 text-tg-button-text"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
