"use client";

import { Fragment, type ReactNode, useMemo } from "react";

/** Tags accepted by Telegram's HTML parse mode, mapped to what we render. */
const TAGS: Record<string, string> = {
  b: "strong",
  strong: "strong",
  i: "em",
  em: "em",
  u: "u",
  ins: "u",
  s: "s",
  strike: "s",
  del: "s",
  code: "code",
  pre: "pre",
  blockquote: "blockquote",
  a: "a",
  "tg-spoiler": "spoiler",
  "tg-emoji": "fragment",
};

const SAFE_URL = /^(https?:|tg:|mailto:)/i;

interface Rendered {
  nodes: ReactNode;
  /** Tags Telegram would reject ("Unsupported start tag"). */
  unsupported: string[];
}

function render(node: Node, unsupported: Set<string>, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child, i) =>
    render(child, unsupported, `${key}.${i}`),
  );
  const isSpoilerSpan = tag === "span" && element.getAttribute("class") === "tg-spoiler";
  const kind = isSpoilerSpan ? "spoiler" : TAGS[tag];

  switch (kind) {
    case "strong":
      return <strong key={key}>{children}</strong>;
    case "em":
      return <em key={key}>{children}</em>;
    case "u":
      return <u key={key}>{children}</u>;
    case "s":
      return <s key={key}>{children}</s>;
    case "code":
      return (
        <code
          key={key}
          className="rounded bg-black/5 px-1 font-mono text-[0.85em] dark:bg-white/10"
        >
          {children}
        </code>
      );
    case "pre":
      return (
        <pre
          key={key}
          className="my-1 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[0.85em] dark:bg-white/10"
        >
          {children}
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="my-1 border-l-2 border-sky-500 pl-2">
          {children}
        </blockquote>
      );
    case "a": {
      const href = element.getAttribute("href") ?? "";
      return SAFE_URL.test(href) ? (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline dark:text-sky-400"
        >
          {children}
        </a>
      ) : (
        <Fragment key={key}>{children}</Fragment>
      );
    }
    case "spoiler":
      return (
        <span key={key} className="rounded bg-current/20 blur-[3px] transition hover:blur-none">
          {children}
        </span>
      );
    case "fragment":
      return <Fragment key={key}>{children}</Fragment>;
    default:
      unsupported.add(tag);
      return <Fragment key={key}>{children}</Fragment>;
  }
}

/** Parses Telegram HTML into React elements (never `innerHTML`), collecting unsupported tags. */
function useTelegramHtml(html: string): Rendered {
  return useMemo(() => {
    if (typeof window === "undefined") return { nodes: html, unsupported: [] };
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const unsupported = new Set<string>();
    const nodes = Array.from(doc.body.childNodes).map((child, i) =>
      render(child, unsupported, String(i)),
    );
    return { nodes, unsupported: [...unsupported] };
  }, [html]);
}

/** A Telegram-like chat bubble showing how the broadcast will look. */
export function TelegramPreview({
  text,
  imageUrl,
  buttonText,
  buttonUrl,
}: {
  text: string;
  imageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
}) {
  const { nodes, unsupported } = useTelegramHtml(text);
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-[#c5d9ea] p-4 dark:bg-[#0e1621]" aria-hidden={false}>
        <div className="max-w-sm">
          <div className="overflow-hidden rounded-2xl rounded-bl-sm bg-white text-sm text-[#000] shadow-sm dark:bg-[#182533] dark:text-[#f5f5f5]">
            {imageUrl ? (
              // biome-ignore lint/performance/noImgElement: arbitrary external URLs, preview only
              <img src={imageUrl} alt="" className="max-h-64 w-full object-cover" />
            ) : null}
            <div className="px-3 py-2 break-words whitespace-pre-wrap">{nodes}</div>
          </div>
          {buttonText ? (
            <div
              className="mt-1 rounded-lg bg-black/25 px-3 py-2 text-center text-sm font-medium text-white"
              title={buttonUrl ?? undefined}
            >
              {buttonText}
            </div>
          ) : null}
        </div>
      </div>
      {unsupported.length > 0 ? (
        <p role="alert" className="text-xs text-destructive">
          Telegram does not support: {unsupported.map((tag) => `<${tag}>`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
