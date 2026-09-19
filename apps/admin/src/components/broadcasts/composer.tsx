"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type BroadcastContentBody,
  type BroadcastDto,
  broadcastContentSchema,
  htmlTextLength,
  MESSAGE_TEXT_LIMIT,
  PHOTO_CAPTION_LIMIT,
} from "@tgstack/shared";
import { SaveIcon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { TelegramPreview } from "./telegram-preview";

interface FormState {
  text: string;
  imageUrl: string;
  buttonText: string;
  buttonUrl: string;
}

function toBody(form: FormState): BroadcastContentBody {
  return {
    text: form.text,
    imageUrl: form.imageUrl.trim() || null,
    buttonText: form.buttonText.trim() || null,
    buttonUrl: form.buttonUrl.trim() || null,
  };
}

/**
 * Edits a draft (or creates one) with a live Telegram-like preview. "Send preview"
 * saves first, then sends the message to the signed-in admin only.
 */
export function BroadcastComposer({ broadcast }: { broadcast?: BroadcastDto }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    text: broadcast?.text ?? "",
    imageUrl: broadcast?.imageUrl ?? "",
    buttonText: broadcast?.buttonText ?? "",
    buttonUrl: broadcast?.buttonUrl ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const limit = form.imageUrl.trim() ? PHOTO_CAPTION_LIMIT : MESSAGE_TEXT_LIMIT;
  const length = htmlTextLength(form.text);
  const set = (field: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  /** Validates locally with the same schema as the server, then creates or updates the draft. */
  const save = useMutation({
    mutationFn: async () => {
      const body = toBody(form);
      const parsed = broadcastContentSchema.safeParse(body);
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
          ),
        );
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid");
      }
      setErrors({});
      return broadcast ? api.broadcasts.update(broadcast.id, body) : api.broadcasts.create(body);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      if (!broadcast) router.replace(`/broadcasts/${saved.id}`);
    },
  });

  const preview = useMutation({
    mutationFn: async () => {
      const saved = await save.mutateAsync();
      await api.broadcasts.preview(saved.id);
    },
    onSuccess: () => toast.success(t("composer-preview-sent")),
    onError: (error) => toast.error(error.message),
  });

  const fieldError = (field: string) =>
    errors[field] ? (
      <p id={`${field}-error`} className="text-xs text-destructive">
        {errors[field]}
      </p>
    ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("composer-text")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(undefined, {
                onSuccess: () => toast.success(t("saved")),
                onError: (error) => toast.error(error.message),
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="text">{t("composer-text")}</Label>
              <Textarea
                id="text"
                rows={8}
                value={form.text}
                onChange={set("text")}
                className="font-mono text-sm"
                aria-invalid={Boolean(errors.text)}
                aria-describedby="text-help"
              />
              <div
                id="text-help"
                className="flex justify-between gap-2 text-xs text-muted-foreground"
              >
                <span>{t("composer-text-help")}</span>
                <span className={length > limit ? "text-destructive" : undefined}>
                  {t("composer-characters", { count: length, limit })}
                </span>
              </div>
              {fieldError("text")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">{t("composer-image")}</Label>
              <Input
                id="imageUrl"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={form.imageUrl}
                onChange={set("imageUrl")}
                aria-invalid={Boolean(errors.imageUrl)}
              />
              {fieldError("imageUrl")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buttonText">{t("composer-button-text")}</Label>
                <Input id="buttonText" value={form.buttonText} onChange={set("buttonText")} />
                {fieldError("buttonText")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="buttonUrl">{t("composer-button-url")}</Label>
                <Input
                  id="buttonUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={form.buttonUrl}
                  onChange={set("buttonUrl")}
                  aria-invalid={Boolean(errors.buttonUrl)}
                />
                {fieldError("buttonUrl")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending}>
                <SaveIcon aria-hidden />
                {t("composer-save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={preview.isPending || !form.text.trim()}
                onClick={() => preview.mutate()}
              >
                <SendIcon aria-hidden />
                {t("composer-send-preview")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("composer-preview")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TelegramPreview
            text={form.text}
            imageUrl={form.imageUrl.trim() || null}
            buttonText={form.buttonText.trim() || null}
            buttonUrl={form.buttonUrl.trim() || null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
