"use client";

import { BroadcastComposer } from "@/components/broadcasts/composer";
import { PageHeader } from "@/components/page";
import { useT } from "@/lib/i18n";

export default function NewBroadcastPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("broadcasts-new")} />
      <BroadcastComposer />
    </>
  );
}
