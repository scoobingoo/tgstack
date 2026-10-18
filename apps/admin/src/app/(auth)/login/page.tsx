import { connection } from "next/server";
import { Suspense } from "react";
import { LoginCard } from "./login-card";

const USERNAME = /^[A-Za-z0-9_]{5,32}$/;

export default async function LoginPage() {
  // Read at request time, not build time, so one prebuilt image fits every bot.
  await connection();
  const botUsername = process.env.BOT_USERNAME?.replace(/^@/, "");
  return (
    <Suspense>
      <LoginCard
        botUsername={botUsername && USERNAME.test(botUsername) ? botUsername : undefined}
      />
    </Suspense>
  );
}
