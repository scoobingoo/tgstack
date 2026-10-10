import { ShoppingBagIcon, UserIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ProfilePage } from "../pages/profile/profile-page";
import { ShopPage } from "../pages/shop/shop-page";
import { useApp } from "./app-context";

type Tab = "shop" | "profile";

const TABS: { id: Tab; labelKey: string; icon: ReactNode }[] = [
  // EXAMPLE: shop tab
  { id: "shop", labelKey: "tab-shop", icon: <ShoppingBagIcon className="size-5" aria-hidden /> },
  { id: "profile", labelKey: "tab-profile", icon: <UserIcon className="size-5" aria-hidden /> },
];

export function App() {
  const { t } = useApp();
  const [tab, setTab] = useState<Tab>(TABS[0]?.id ?? "profile");

  return (
    <div className="flex min-h-dvh flex-col bg-tg-secondary text-tg-text">
      <main className="flex-1 px-4 pt-4 pb-24">
        {tab === "shop" ? <ShopPage /> : <ProfilePage />}
      </main>
      <nav
        aria-label={t("app-name")}
        className="fixed inset-x-0 bottom-0 flex border-t border-tg-separator bg-tg-bottom-bar pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(({ id, labelKey, icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${tab === id ? "text-tg-accent" : "text-tg-hint"}`}
          >
            {icon}
            {t(labelKey)}
          </button>
        ))}
      </nav>
    </div>
  );
}
