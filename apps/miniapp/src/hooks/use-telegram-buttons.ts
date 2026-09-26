import { backButton, mainButton } from "@tma.js/sdk-react";
import { useEffect, useRef } from "react";

/** Shows Telegram's native Back button while mounted; hides it afterwards. */
export function useBackButton(onBack: (() => void) | undefined): void {
  const handler = useRef(onBack);
  handler.current = onBack;
  const enabled = onBack !== undefined;

  useEffect(() => {
    if (!enabled || !backButton.isMounted()) return;
    backButton.show();
    const off = backButton.onClick(() => handler.current?.());
    return () => {
      off();
      backButton.hide();
    };
  }, [enabled]);
}

/** Shows Telegram's native Main button with `text` while mounted. */
export function useMainButton(
  options: { text: string; onClick: () => void; loading?: boolean } | undefined,
): void {
  const handler = useRef(options?.onClick);
  handler.current = options?.onClick;
  const text = options?.text;
  const loading = options?.loading ?? false;

  useEffect(() => {
    if (text === undefined || !mainButton.isMounted()) return;
    mainButton.setParams({ text, isVisible: true, isEnabled: !loading, isLoaderVisible: loading });
  }, [text, loading]);

  const visible = text !== undefined;
  useEffect(() => {
    if (!visible || !mainButton.isMounted()) return;
    const off = mainButton.onClick(() => handler.current?.());
    return () => {
      off();
      mainButton.setParams({ isVisible: false, isLoaderVisible: false });
    };
  }, [visible]);
}
