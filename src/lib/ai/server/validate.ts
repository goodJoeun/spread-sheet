import { z } from "zod";
import { AI_LIMITS, type AiEditRequest } from "../protocol";

/** 브라우저에서 온 요청은 크기와 형식을 확인한 뒤에만 모델에 보낸다. */

const CELL = /^[A-Z]{1,2}[1-9]\d{0,2}$/;
const RANGE = /^[A-Z]{1,2}[1-9]\d{0,2}(:[A-Z]{1,2}[1-9]\d{0,2})?$/;

const requestSchema = z.object({
  instruction: z.string().trim().min(1).max(AI_LIMITS.instruction),
  range: z.string().regex(RANGE).nullable(),
  cells: z
    .array(z.object({ cell: z.string().regex(CELL), value: z.string().max(AI_LIMITS.cellValue) }))
    .max(AI_LIMITS.cells),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(AI_LIMITS.historyText),
      }),
    )
    .max(AI_LIMITS.history),
  model: z.string().max(100).optional(),
});

export function parseEditRequest(body: unknown): AiEditRequest | null {
  const result = requestSchema.safeParse(body);
  return result.success ? result.data : null;
}
