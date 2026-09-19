"use client";

import {
  CreditCardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MegaphoneIcon,
  PackageIcon,
  SendIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

const MAIN = [
  { href: "/", key: "nav-dashboard", icon: LayoutDashboardIcon },
  { href: "/users", key: "nav-users", icon: UsersIcon },
  { href: "/broadcasts", key: "nav-broadcasts", icon: MegaphoneIcon },
  { href: "/payments", key: "nav-payments", icon: CreditCardIcon },
] as const;

// EXAMPLE: shop
const SHOP = [{ href: "/products", key: "nav-products", icon: PackageIcon }] as const;

export function AppSidebar() {
  const t = useT();
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function logout() {
    await api.auth.logout().catch(() => undefined);
    window.location.assign("/login");
  }

  const renderItems = (items: readonly { href: string; key: string; icon: typeof UsersIcon }[]) =>
    items.map(({ href, key, icon: Icon }) => (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton asChild isActive={isActive(href)} tooltip={t(key)}>
          <Link href={href}>
            <Icon aria-hidden />
            <span>{t(key)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <SendIcon className="size-4" aria-hidden />
                </span>
                <span className="font-semibold">{t("app-name")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav-section-main")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(MAIN)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav-section-shop")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(SHOP)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip={t("action-logout")}>
              <LogOutIcon aria-hidden />
              <span>{t("action-logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
