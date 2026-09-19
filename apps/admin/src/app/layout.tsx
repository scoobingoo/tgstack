import { DEFAULT_LOCALE, isLocale } from "@tgstack/i18n";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import "./globals.css";

const sans = Geist({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "tgstack admin", template: "%s · tgstack admin" },
  description: "Admin dashboard for your Telegram bot",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      className={cn("font-sans antialiased", sans.variable, mono.variable)}
      suppressHydrationWarning
    >
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
