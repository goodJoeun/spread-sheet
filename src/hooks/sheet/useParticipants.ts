import { useSyncExternalStore } from "react";
import type { Participant, Presence } from "@/lib/collab/presence";

export function useParticipants(presence: Presence): Participant[] {
  return useSyncExternalStore(
    presence.subscribe,
    presence.getParticipants,
    presence.getParticipants,
  );
}
