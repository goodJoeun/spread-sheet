import "server-only";
import { z } from "zod";
import { isSheetCellA1 } from "@/lib/sheet/schema";
import { AI_LIMITS, type AiEditRequest } from "../protocol";

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
  model: z.string().max(100).optional(),
});

export function parseEditRequest(body: unknown): AiEditRequest | null {
  const result = requestSchema.safeParse(body);
  return result.success ? result.data : null;
}
