import { useQueryClient } from "@tanstack/react-query";
import {
  type BroadcastProgressDto,
  broadcastProgressSchema,
  TERMINAL_BROADCAST_STATUSES,
} from "@tgstack/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const POLL_MS = 2_000;

/**
 * Live broadcast progress: Server-Sent Events from `/broadcasts/:id/events`,
 * falling back to polling if the stream cannot be opened (some proxies buffer SSE).
 * Returns the latest progress and whether updates are live.
 */
export function useBroadcastProgress(
  id: string,
  initial: BroadcastProgressDto | undefined,
): { progress: BroadcastProgressDto | undefined; live: boolean } {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(initial);
  const [live, setLive] = useState(false);
  const active = initial !== undefined && !TERMINAL_BROADCAST_STATUSES.includes(initial.status);

  useEffect(() => {
    setProgress(initial);
  }, [initial]);

  useEffect(() => {
    if (!active) return;
    let poll: ReturnType<typeof setInterval> | undefined;
    let finished = false;
    const update = (next: BroadcastProgressDto) => {
      setProgress(next);
      if (TERMINAL_BROADCAST_STATUSES.includes(next.status)) {
        void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      }
    };

    const source = new EventSource(api.broadcasts.eventsUrl(id), { withCredentials: true });
    source.addEventListener("progress", (event) => {
      const parsed = broadcastProgressSchema.safeParse(
        JSON.parse((event as MessageEvent<string>).data),
      );
      if (parsed.success) {
        finished = TERMINAL_BROADCAST_STATUSES.includes(parsed.data.status);
        setLive(!finished);
        update(parsed.data);
        if (finished) source.close();
      }
    });
    source.onerror = () => {
      // The server closes the stream after a final status; otherwise fall back to polling.
      source.close();
      setLive(false);
      if (poll || finished) return;
      poll = setInterval(async () => {
        const next = await api.broadcasts.progress(id).catch(() => undefined);
        if (!next) return;
        update(next);
        if (TERMINAL_BROADCAST_STATUSES.includes(next.status) && poll) clearInterval(poll);
      }, POLL_MS);
    };

    return () => {
      source.close();
      if (poll) clearInterval(poll);
    };
  }, [id, active, queryClient]);

  return { progress, live };
}
