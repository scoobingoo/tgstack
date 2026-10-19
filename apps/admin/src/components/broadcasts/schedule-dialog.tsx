"use client";

import { CalendarClockIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

/** `<input type="datetime-local">` value (local time, minutes) for a date. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Picks the send time in the browser's time zone and hands an ISO timestamp
 * (UTC) to `onSchedule`. Defaults to the current schedule or one hour from now.
 */
export function ScheduleDialog({
  trigger,
  current,
  pending,
  onSchedule,
}: {
  trigger: ReactNode;
  current?: string | null;
  pending?: boolean;
  onSchedule: (scheduledAt: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const onOpenChange = (next: boolean) => {
    if (next) {
      const initial = current ? new Date(current) : new Date(Date.now() + 60 * 60 * 1000);
      setValue(toLocalInput(initial));
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!value) return;
            await onSchedule(new Date(value).toISOString())
              .then(() => setOpen(false))
              .catch(() => undefined); // the caller shows the error; keep the dialog open
          }}
        >
          <DialogHeader>
            <DialogTitle>{t(current ? "schedule-reschedule" : "schedule-title")}</DialogTitle>
            <DialogDescription>{t("schedule-description", { zone })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="scheduled-at">{t("schedule-at")}</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              required
              min={toLocalInput(new Date(Date.now() + 60_000))}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !value}>
              <CalendarClockIcon aria-hidden />
              {t("schedule-save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
