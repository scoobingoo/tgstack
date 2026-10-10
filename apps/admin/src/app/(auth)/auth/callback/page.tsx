"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

/** Exchanges the one-time token from the bot's /admin link for a session cookie. */
function Callback() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: never exchange twice (React strict mode runs effects twice in dev).
    if (started.current) return;
    started.current = true;
    if (!token) {
      setFailed(true);
      return;
    }
    api.auth
      .exchange(token)
      .then(() => router.replace("/"))
      .catch(() => setFailed(true));
  }, [token, router]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{failed ? t("error-title") : t("callback-signing-in")}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <>
            <p className="text-sm text-muted-foreground">{t("callback-failed")}</p>
            <Button asChild variant="outline">
              <Link href="/login">{t("callback-back")}</Link>
            </Button>
          </>
        ) : (
          <Loader2Icon
            className="size-6 animate-spin text-muted-foreground"
            aria-label={t("loading")}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
