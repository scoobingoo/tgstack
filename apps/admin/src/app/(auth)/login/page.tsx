"use client";

import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME;

function LoginCard() {
  const t = useT();
  const expired = useSearchParams().get("expired") === "1";
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRoundIcon className="size-5" aria-hidden />
        </div>
        <CardTitle>
          <h1 className="text-xl">{t("login-title")}</h1>
        </CardTitle>
        <CardDescription>{t("login-description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expired ? (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {t("error-unauthorized")}
          </p>
        ) : null}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("login-command")}</p>
          <code className="block rounded-md bg-muted px-3 py-2 font-mono text-lg">/admin</code>
        </div>
        {BOT_USERNAME ? (
          <Button asChild className="w-full">
            <a href={`https://t.me/${BOT_USERNAME}?text=%2Fadmin`} target="_blank" rel="noreferrer">
              {t("login-open-bot")} @{BOT_USERNAME}
              <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("login-admins-only")}</p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
