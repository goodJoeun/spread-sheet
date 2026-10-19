import "server-only";
import { z } from "zod";
import { isSheetCellA1 } from "@/lib/sheet/schema";
import { AI_LIMITS, type AiEditRequest } from "../protocol";

/** "B2"나 "A1:C3"처럼 시트 안의 정규 A1 범위인지. */
const isSheetRangeA1 = (input: string) => {
  const parts = input.split(":");
  return parts.length <= 2 && parts.every(isSheetCellA1);
};

const requestSchema = z.object({
  instruction: z.string().trim().min(1).max(AI_LIMITS.instruction),
  range: z.string().refine(isSheetRangeA1).nullable(),
  cells: z
    .array(
      z.object({
        cell: z.string().refine(isSheetCellA1),
        value: z.string().max(AI_LIMITS.cellValue),
      }),
    )
    .max(AI_LIMITS.cells),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(AI_LIMITS.historyText),
      }),
    )
    .max(AI_LIMITS.history),
  model: z.string().max(AI_LIMITS.modelId).optional(),
});

/** 브라우저가 보낸 요청을 zod로 검증함. 통과하지 못하면 null(라우트가 400으로 처리). */
export function parseEditRequest(body: unknown): AiEditRequest | null {
  const result = requestSchema.safeParse(body);
  return result.success ? result.data : null;
}
