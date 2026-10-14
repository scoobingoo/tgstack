import type { ReactNode } from "react";
import { LocaleSwitch, ThemeToggle } from "@/components/header-controls";

/** Public pages (sign-in): a centered card, no sidebar. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="absolute top-4 right-4 flex gap-1">
        <LocaleSwitch />
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}
