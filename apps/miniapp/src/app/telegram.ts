import {
  backButton,
  init,
  isTMA,
  mainButton,
  miniApp,
  retrieveRawInitData,
  themeParams,
  viewport,
} from "@tma.js/sdk-react";

export type TelegramEnvironment = { ok: true } | { ok: false; reason: "outside-telegram" };

/** Initialises the SDK and mounts the native components the app uses. */
export async function initTelegram(): Promise<TelegramEnvironment> {
  if (import.meta.env.DEV) {
    // The cheap check also trusts launch params cached in sessionStorage by an earlier
    // mock; "complete" asks the Telegram client itself whether it is there.
    if (!(await isTMA("complete"))) {
      // An empty stub in production builds (see devMockModule in vite.config.ts).
      const { mockEnvironmentForBrowserDev } = await import("virtual:dev-mock");
      await mockEnvironmentForBrowserDev();
    }
  } else if (!isTMA()) {
    return { ok: false, reason: "outside-telegram" };
  }
  init();
  miniApp.mount();
  themeParams.mount();
  // Exposes Telegram's colours as CSS variables (--tg-theme-bg-color, …).
  if (!themeParams.isCssVarsBound()) themeParams.bindCssVars();
  if (!miniApp.isCssVarsBound()) miniApp.bindCssVars();
  backButton.mount();
  mainButton.mount();
  if (viewport.mount.isAvailable()) {
    // Never block the app on the viewport: it only affects the full-height layout.
    await viewport.mount({ timeout: 2_000 }).catch((error: unknown) => console.warn(error));
    if (viewport.isMounted()) viewport.expand();
  }
  miniApp.ready();
  return { ok: true };
}

/** `Telegram.WebApp.initData` — sent to the server as `Authorization: tma <raw>`. */
export function getRawInitData(): string {
  return retrieveRawInitData() ?? "";
}
