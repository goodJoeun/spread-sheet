"use client";

import { useEffect, useState } from "react";
import type { AiController } from "@/lib/ai/ai-controller";
import { AI_ENDPOINT, type AiConnectionInfo } from "@/lib/ai/protocol";

/** 보는 사람마다 따로라 localStorage에 둔다 */
const MODEL_KEY = "spread-sheet:ai-model";

/** 마지막으로 고른 모델을 되살리되, 서버가 더 이상 허용하지 않으면 서버 기본 모델로 돌아간다. */
export function useAiConnection(ai: AiController): AiConnectionInfo | null {
  const [connection, setConnection] = useState<AiConnectionInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch(AI_ENDPOINT)
      .then((res) => (res.ok ? (res.json() as Promise<AiConnectionInfo>) : null))
      .then((info) => {
        if (!active || !info || !Array.isArray(info.models)) return;
        const preferred = ai.model.get() ?? readSavedModel();
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

export function chooseModel(ai: AiController, id: string): void {
  ai.model.set(id);
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // 저장할 수 없어도(사생활 보호 모드 등) 이번 화면에서는 고른 모델을 쓴다.
  }
}

function readSavedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}
