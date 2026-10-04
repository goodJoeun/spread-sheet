"use client";

import { useEffect, useState } from "react";
import type { AiController } from "@/lib/ai/ai-controller";
import { loadModelPreference } from "@/lib/ai/model-preference";
import { AI_ENDPOINT, type AiConnectionInfo } from "@/lib/ai/protocol";

/** 마지막으로 고른 모델을 되살리되, 서버가 더 이상 허용하지 않으면 서버 기본 모델로 돌아간다. */
export function useAiConnection(ai: AiController): AiConnectionInfo | null {
  const [connection, setConnection] = useState<AiConnectionInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch(AI_ENDPOINT)
      .then((res) => (res.ok ? (res.json() as Promise<AiConnectionInfo>) : null))
      .then((info) => {
        if (!active || !info || !Array.isArray(info.models)) return;
        const preferred = ai.model.get() ?? loadModelPreference();
        ai.model.set(info.models.some((m) => m.id === preferred) ? preferred : null);
        setConnection(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ai]);

  return connection;
}
