// Development only (imported dynamically from telegram.ts when not inside Telegram).
import { emitEvent, mockTelegramEnv } from "@tma.js/sdk-react";

/** Development only: draws Telegram's native Main and Back buttons as plain DOM buttons. */
function createDevNativeButtons() {
  const style = "position:fixed;z-index:50;border:0;font:600 15px system-ui;cursor:pointer";
  const main = document.createElement("button");
  main.style.cssText = `${style};left:12px;right:12px;bottom:72px;height:48px;border-radius:12px;color:#fff;background:#2481cc;display:none`;
  main.onclick = () => emitEvent("main_button_pressed");
  const back = document.createElement("button");
  back.textContent = "‹ Back";
  back.style.cssText = `${style};left:8px;top:8px;padding:6px 10px;border-radius:8px;background:#0000000f;color:#2481cc;display:none`;
  back.onclick = () => emitEvent("back_button_pressed");
  document.body.append(main, back);
  return {
    main(params: {
      is_visible?: boolean;
      is_active?: boolean;
      is_progress_visible?: boolean;
      text?: string;
    }) {
      main.style.display = params.is_visible ? "block" : "none";
      main.textContent = params.is_progress_visible ? "…" : (params.text ?? "");
      main.disabled = params.is_active === false;
      main.style.opacity = main.disabled ? "0.6" : "1";
    },
    back(params: { is_visible?: boolean }) {
      back.style.display = params.is_visible ? "block" : "none";
    },
  };
}

/**
 * In `vite dev` outside Telegram, pretend to be Telegram: the dev server signs a
 * real initData for a fake user (see vite.config.ts), so the server's
 * MiniAppAuthGuard accepts it. Never happens in production builds.
 */
export async function mockEnvironmentForBrowserDev(): Promise<void> {
  const response = await fetch("/__dev/init-data");
  if (!response.ok) throw new Error(await response.text());
  const initData = await response.text();
  const buttons = createDevNativeButtons();
  mockTelegramEnv({
    launchParams: {
      tgWebAppData: initData,
      tgWebAppVersion: "9.0",
      tgWebAppPlatform: "tdesktop",
      tgWebAppThemeParams: {
        bg_color: "#ffffff",
        secondary_bg_color: "#f1f1f4",
        section_bg_color: "#ffffff",
        text_color: "#000000",
        hint_color: "#707579",
        link_color: "#2481cc",
        button_color: "#2481cc",
        button_text_color: "#ffffff",
        accent_text_color: "#2481cc",
        destructive_text_color: "#e53935",
        section_separator_color: "#e7e7e7",
        subtitle_text_color: "#707579",
        header_bg_color: "#ffffff",
        bottom_bar_bg_color: "#ffffff",
        section_header_text_color: "#6d6d72",
      },
    },
    // Answer the requests a real Telegram client would answer.
    onEvent(event, next) {
      const zeroInsets = { top: 0, bottom: 0, left: 0, right: 0 };
      switch (event.name) {
        case "web_app_request_viewport":
          return emitEvent("viewport_changed", {
            height: window.innerHeight,
            width: window.innerWidth,
            is_expanded: true,
            is_state_stable: true,
          });
        case "web_app_request_safe_area":
          return emitEvent("safe_area_changed", zeroInsets);
        case "web_app_request_content_safe_area":
          return emitEvent("content_safe_area_changed", zeroInsets);
        case "web_app_setup_main_button":
          return buttons.main(event.params as Parameters<typeof buttons.main>[0]);
        case "web_app_setup_back_button":
          return buttons.back(event.params as Parameters<typeof buttons.back>[0]);
        case "web_app_open_invoice": {
          // No payments outside Telegram: report the invoice as cancelled.
          const { slug } = event.params as { slug: string };
          console.info("[dev] openInvoice", slug);
          setTimeout(() => emitEvent("invoice_closed", { slug, status: "cancelled" }), 500);
          return;
        }
        default:
          next();
      }
    },
  });
}
