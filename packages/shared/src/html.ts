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

/**
 * Length of an HTML-formatted message as Telegram counts it: after removing
 * tags and decoding entities (limits such as 4096 apply to this length).
 */
export function htmlTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/&(?:lt|gt|amp|quot|#\d+|#x[\da-f]+);/gi, "_").length;
}
