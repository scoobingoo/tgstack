"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { LocaleSwitch, ThemeToggle } from "@/components/header-controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/lib/api";

function CurrentAdmin() {
  const { data } = useQuery({ queryKey: ["auth", "me"], queryFn: api.auth.me, staleTime: 60_000 });
  if (!data) return null;
  const { user } = data;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Avatar className="size-7">
        <AvatarFallback>{user.firstName.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="hidden sm:inline">{user.firstName}</span>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0 lets wide tables scroll inside the page instead of stretching it. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitch />
            <ThemeToggle />
            <CurrentAdmin />
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
