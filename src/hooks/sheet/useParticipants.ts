import { useSyncExternalStore } from "react";
import type { Presence } from "@/lib/collab/presence";
import type { Participant } from "@/lib/collab/presence-state";

export function useParticipants(presence: Presence): Participant[] {
  return useSyncExternalStore(
    presence.subscribe,
    presence.getParticipants,
    presence.getParticipants,
  );
}
