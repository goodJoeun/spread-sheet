import type Anthropic from "@anthropic-ai/sdk";
import type { AiCell, AiEditRequest } from "../protocol";

/**
 * 편집 결과는 propose_edits 도구 호출로 받는다. 도구 입력을 스트리밍(eager_input_streaming)하면
 * edits 원소가 생성되는 대로 도착해 셀 제안을 하나씩 보여 줄 수 있다. 도구를 실행해 대화를 잇지는 않는다.
 */

export const EDIT_TOOL_NAME = "propose_edits";

export const EDIT_TOOL: Anthropic.Beta.BetaTool = {
  name: EDIT_TOOL_NAME,
  description:
    "Propose new values for spreadsheet cells. Call this once whenever the user's request changes the sheet, " +
    "listing every cell whose value should change. Do not call it when the user only asks a question.",
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      edits: {
        type: "array",
        description: "Cells to change, in reading order (row by row, left to right).",
        items: {
          type: "object",
          properties: {
            cell: { type: "string", description: "Cell address in A1 notation, e.g. B2" },
            value: {
              type: "string",
              description: "New cell value as plain text. Empty string clears the cell.",
            },
          },
          required: ["cell", "value"],
        },
      },
    },
    required: ["edits"],
  },
};

export const SYSTEM_PROMPT = `You are the editing assistant inside a collaborative web spreadsheet.
The sheet has 100 rows and 26 columns (A1 to Z100). Several people may be editing it at the same time.

How to respond:
- Reply in the user's language.
- First write one or two short sentences saying what you will change, or answer the question.
- If the request changes the sheet, then call ${EDIT_TOOL_NAME} once with every cell whose value should change.
- If the request is only a question, answer in text and do not call the tool.

Rules for edits:
- When an editable range is given, change only cells inside it.
- Values are plain text. The sheet has no formula engine, so write computed results (e.g. "1,250"), not formulas.
- Use an empty string to clear a cell. Leave out cells that do not change.
- Keep the existing style of the data (number formats, units, capitalization) unless asked to change it.`;

/** 값은 JSON 문자열로 적어 줄바꿈·따옴표가 있어도 모호하지 않게 한다. */
export function formatSheet(cells: readonly AiCell[]): string {
  if (cells.length === 0) return "(the sheet is empty)";
  return cells.map(({ cell, value }) => `${cell} = ${JSON.stringify(value)}`).join("\n");
}

export function buildUserMessage(request: AiEditRequest): string {
  const range = request.range
    ? `Editable range: ${request.range} (do not change cells outside it)`
    : "Editable range: entire sheet (A1:Z100)";
  return [
    "Current sheet (non-empty cells only):",
    "<sheet>",
    formatSheet(request.cells),
    "</sheet>",
    "",
    range,
    "",
    "Request:",
    request.instruction,
  ].join("\n");
}

/** 이전 대화 + 이번 요청. 시트 내용은 바뀌므로 마지막 요청에만 싣는다. */
export function buildMessages(request: AiEditRequest): Anthropic.Beta.BetaMessageParam[] {
  const history: Anthropic.Beta.BetaMessageParam[] = request.history.map((item) => ({
    role: item.role,
    content: item.text,
  }));
  // 첫 메시지는 user여야 한다.
  while (history.length > 0 && history[0].role !== "user") history.shift();
  return [...history, { role: "user", content: buildUserMessage(request) }];
}

/** 가짜 Claude가 요청 본문만 보고 답을 만들 때 쓴다. */
export function parseUserMessage(text: string): {
  cells: AiCell[];
  range: string | null;
  instruction: string;
} {
  const sheet = /<sheet>\n([\s\S]*?)\n<\/sheet>/.exec(text)?.[1] ?? "";
  const cells: AiCell[] = [];
  for (const line of sheet.split("\n")) {
    const match = /^([A-Z]+\d+) = (".*")$/.exec(line);
    if (!match) continue;
    try {
      cells.push({ cell: match[1], value: JSON.parse(match[2]) as string });
    } catch {
      // 형식이 맞지 않는 줄은 건너뛴다.
    }
  }
  const range = /^Editable range: ([A-Z]+\d+(?::[A-Z]+\d+)?) \(/m.exec(text)?.[1] ?? null;
  const instruction = text.split("\nRequest:\n")[1] ?? "";
  return { cells, range, instruction };
}
