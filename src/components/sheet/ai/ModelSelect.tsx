"use client";

import { useStore } from "@/hooks/useStore";
import { modelDescription } from "@/lib/ai/messages";
import { saveModelPreference } from "@/lib/ai/model-preference";
import type { AiConnectionInfo } from "@/lib/ai/protocol";
import { strings } from "@/resources/strings";
import { useSheet } from "../SheetContext";

const MODEL_SELECT =
  "min-w-0 truncate rounded-md bg-transparent py-xs pr-xs pl-sm text-label text-fg-muted " +
  "outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ai/40";

/** 다음 요청에 쓸 모델. 고른 모델은 이 브라우저에 기억함. */
export function ModelSelect({ connection }: { connection: AiConnectionInfo }) {
  const { ai } = useSheet();
  const model = useStore(ai.model) ?? connection.defaultModel;

  const choose = (id: string) => {
    ai.model.set(id);
    saveModelPreference(id);
  };

  return (
    <select
      value={model}
      onChange={(e) => choose(e.target.value)}
      aria-label={strings.ai.composer.model}
      title={strings.ai.composer.modelTitle}
      className={MODEL_SELECT}
    >
      {connection.models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} · {modelDescription(m.id)}
        </option>
      ))}
    </select>
  );
}
