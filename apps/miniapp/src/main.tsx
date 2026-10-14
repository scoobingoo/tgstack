import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTranslator, negotiateLocale } from "@tgstack/i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProvider } from "./app/app-context";
import { getRawInitData, initTelegram } from "./app/telegram";
import { ApiError, createApiClient } from "./lib/api";
import "./index.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
// Before we know the user, use the browser language for the few early messages.
const t = createTranslator(negotiateLocale(navigator.language), "miniapp");

function Message({ text }: { text: string }) {
  return (
    <p className="flex min-h-dvh items-center justify-center p-8 text-center text-tg-hint">
      {text}
    </p>
  );
}

async function bootstrap(): Promise<void> {
  const environment = await initTelegram().catch((error: unknown) => {
    console.error(error);
    return { ok: false as const, reason: "outside-telegram" as const };
  });

  if (!environment.ok) {
    root.render(<Message text={t("outside-telegram")} />);
    return;
  }

  const api = createApiClient(getRawInitData);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppProvider api={api}>
          <App />
        </AppProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

// No top-level await: some Telegram WebViews run older engines.
void bootstrap();
