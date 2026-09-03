const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * Escapes text for Telegram's HTML parse mode. Use it on every user-provided
 * value interpolated into a message (names, usernames, free text).
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}
