import type * as Y from "yjs";
import {
  intersectRanges,
  normalizeRange,
  parseA1,
  rangeContains,
  rangeToA1,
  toA1,
  type CellCoord,
  type CellRange,
} from "@/lib/sheet/address";
import { EditOrigin, valuesOf, writeValues } from "@/lib/sheet/document";
import { SHEET_RANGE, isInSheet } from "@/lib/sheet/schema";
import type { Selection } from "@/lib/sheet/selection";
import { createStore } from "@/lib/store";
import {
  AI_LIMITS,
  aiError,
  type AiCell,
  type AiEditRequest,
  type AiErrorInfo,
  type AiHistoryItem,
  type AiStreamEvent,
} from "./protocol";
import { AiRequestError, type AiTransport } from "./transport";

/**
 * AI 편집 한 번(요청 → 생성 → 검토 → 적용/버리기)의 상태를 관리한다.
 *
 * - AI 결과는 문서에 바로 쓰지 않는다. 제안(proposals)으로 들고 있다가, 적용할 때 한 트랜잭션으로 쓴다.
 *   그래서 적용한 결과는 실행 취소 한 번으로 모두 되돌아간다.
 * - 응답이 SLOW_AFTER_MS 동안 없으면 "응답 지연"을 표시하고, IDLE_TIMEOUT_MS 동안 없으면 중단한다.
 * - 요청 시점의 셀 값(base)을 기억해 둔다. 원래 값과 비교해 보여 주고, 다른 참여자가 그사이 바꾼 셀을 찾는 데 쓴다.
 */

export const SLOW_AFTER_MS = 5_000;
export const IDLE_TIMEOUT_MS = 60_000;

export type AiRunStatus =
  | "waiting" // 요청을 보냈고 아직 아무 내용도 오지 않음
  | "streaming" // 설명이나 제안이 들어오는 중
  | "review" // 다 받았고, 적용/버리기를 기다림
  | "answered" // 바꿀 셀 없이 답만 함
  | "applied"
  | "discarded"
  | "cancelled"
  | "error";

export interface AiProposal {
  coord: CellCoord;
  cell: string;
  /** 요청 시점의 값 */
  before: string;
  after: string;
}

export interface AiRun {
  id: number;
  instruction: string;
  /** 편집을 허용한 범위. null이면 시트 전체 */
  scope: CellRange | null;
  status: AiRunStatus;
  /** 서버가 응답을 시작했는지 */
  connected: boolean;
  /** 한동안 아무 내용도 오지 않음 */
  slow: boolean;
  provider: string | null;
  model: string | null;
  text: string;
  proposals: AiProposal[];
  /** 범위 밖 등으로 뺀 제안 수 */
  skipped: number;
  warnings: string[];
  error: AiErrorInfo | null;
  /** 요청 시점의 셀 값(비어 있지 않은 셀) */
  base: ReadonlyMap<string, string>;
}

export type AiMessage =
  | { id: number; role: "user"; text: string; scope: CellRange | null }
  | { id: number; role: "assistant"; run: AiRun };

/** AI 컨트롤러가 시트 화면에 요청하는 것(SheetController가 이 모양을 갖는다). */
export interface AiSheetBinding {
  commitEdit(): void;
  select(selection: Selection, reveal?: CellCoord | null): void;
  reveal(coord: CellCoord): void;
  focus(): void;
}

const RUNNING: ReadonlySet<AiRunStatus> = new Set(["waiting", "streaming"]);

export class AiController {
  readonly messages = createStore<AiMessage[]>([]);
  /** 미리보기에 그릴 실행(생성 중이거나 검토 중). 없으면 null */
  readonly active = createStore<AiRun | null>(null);
  /** 검토 중 "원래 값 보기"를 켰는지 */
  readonly showOriginal = createStore(false);

  private nextId = 1;
  private inflight: { runId: number; abort: AbortController } | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly doc: Y.Doc,
    private readonly sheet: AiSheetBinding,
    private readonly transport: AiTransport,
  ) {}

  /** 생성 중이거나 검토를 기다리는 결과가 있으면 새 요청을 받지 않는다. */
  isBusy(): boolean {
    const run = this.active.get();
    return this.inflight !== null || run?.status === "review";
  }

  /** @returns 요청을 보냈으면 true */
  send(instruction: string, scope: CellRange | null): boolean {
    const text = instruction.trim().slice(0, AI_LIMITS.instruction);
    if (!text || this.isBusy()) return false;

    const range = scope ? intersectRanges(scope, SHEET_RANGE) : null;
    const cells = this.sheetCells();
    const request: AiEditRequest = {
      instruction: text,
      range: range ? rangeToA1(range) : null,
      cells,
      history: this.history(),
    };
    const run: AiRun = {
      id: 0,
      instruction: text,
      scope: range,
      status: "waiting",
      connected: false,
      slow: false,
      provider: null,
      model: null,
      text: "",
      proposals: [],
      skipped: 0,
      warnings: [],
      error: null,
      base: new Map(cells.map((c) => [c.cell, c.value])),
    };
    const userId = this.nextId++;
    run.id = this.nextId++;
    this.messages.set((list) => [
      ...list,
      { id: userId, role: "user", text, scope: range },
      { id: run.id, role: "assistant", run },
    ]);
    this.showOriginal.set(false);
    this.active.set(run);

    const abort = new AbortController();
    this.inflight = { runId: run.id, abort };
    this.armWatchdog();

    let finished = false;
    this.transport(request, {
      signal: abort.signal,
      onEvent: (event) => {
        if (this.inflight?.runId !== run.id) return;
        this.armWatchdog();
        if (this.handleEvent(run.id, event)) finished = true;
      },
    })
      .then(() => {
        if (!finished && this.inflight?.runId === run.id) {
          this.fail(run.id, aiError("network", "응답이 중간에 끊겼어요. 다시 시도해 주세요."));
        }
      })
      .catch((error: unknown) => {
        // 중단·시간 초과·완료로 이미 정리된 실행이면 무시한다.
        if (this.inflight?.runId !== run.id) return;
        this.fail(run.id, error instanceof AiRequestError ? error.info : aiError("network"));
      });
    return true;
  }

  /** 생성 중인 요청을 멈춘다. 받은 제안은 쓰지 않는다. */
  cancel(): void {
    const current = this.inflight;
    if (!current) return;
    this.settle();
    current.abort.abort();
    this.update(current.runId, (run) => ({ ...run, status: "cancelled", slow: false }));
    this.active.set(null);
  }

  /** 검토 중인 제안을 문서에 쓴다. 한 트랜잭션이라 실행 취소 한 번으로 모두 되돌아간다. */
  apply(): void {
    const run = this.active.get();
    if (!run || run.status !== "review" || run.proposals.length === 0) return;

    this.sheet.commitEdit();
    // 적용 직전의 선택을 바뀐 범위로 옮겨 둔다. 실행 취소하면 이 범위로 돌아온다.
    const box = run.proposals
      .map((p) => normalizeRange(p.coord, p.coord))
      .reduce((a, b) =>
        normalizeRange(
          { row: Math.min(a.start.row, b.start.row), col: Math.min(a.start.col, b.start.col) },
          { row: Math.max(a.end.row, b.end.row), col: Math.max(a.end.col, b.end.col) },
        ),
      );
    this.sheet.select({ anchor: box.start, focus: box.end, active: box.start }, box.start);
    writeValues(
      this.doc,
      run.proposals.map((p) => ({ coord: p.coord, value: p.after })),
      EditOrigin.Ai,
    );

    this.update(run.id, (r) => ({ ...r, status: "applied" }));
    this.closeReview();
  }

  discard(): void {
    const run = this.active.get();
    if (!run || run.status !== "review") return;
    this.update(run.id, (r) => ({ ...r, status: "discarded" }));
    this.closeReview();
  }

  /** 실패·중단한 요청을 같은 지시와 범위로 다시 보낸다. */
  retry(runId: number): boolean {
    const message = this.messages.get().find((m) => m.role === "assistant" && m.run.id === runId);
    if (!message || message.role !== "assistant") return false;
    return this.send(message.run.instruction, message.run.scope);
  }

  destroy(): void {
    this.settle();
    this.inflight?.abort.abort();
    this.inflight = null;
  }

  /* ───────────── 내부 ───────────── */

  /** @returns 실행이 끝났으면 true */
  private handleEvent(runId: number, event: AiStreamEvent): boolean {
    switch (event.type) {
      case "meta":
        this.update(runId, (r) => ({
          ...r,
          connected: true,
          slow: false,
          provider: event.provider,
          model: event.model,
        }));
        return false;
      case "text":
        this.update(runId, (r) => ({
          ...r,
          connected: true,
          slow: false,
          status: "streaming",
          text: r.text + event.delta,
        }));
        return false;
      case "edit": {
        const hadProposals = (this.findRun(runId)?.proposals.length ?? 0) > 0;
        this.update(runId, (r) => addProposal(r, event.cell, event.value));
        // 첫 제안이 오면 그 셀을 화면에 보여 준다. 다른 곳을 보고 있어도 생성 과정을 볼 수 있게.
        const first = this.findRun(runId)?.proposals[0];
        if (!hadProposals && first) this.sheet.reveal(first.coord);
        return false;
      }
      case "warning":
        this.update(runId, (r) => ({ ...r, warnings: [...r.warnings, event.message] }));
        return false;
      case "done":
        this.finish(runId);
        return true;
      case "error":
        this.fail(runId, event.error);
        return true;
    }
  }

  private finish(runId: number): void {
    this.settle();
    this.update(runId, (r) => ({
      ...r,
      slow: false,
      status: r.proposals.length > 0 ? "review" : "answered",
    }));
    const run = this.findRun(runId);
    this.active.set(run?.status === "review" ? run : null);
  }

  private fail(runId: number, error: AiErrorInfo): void {
    const current = this.inflight;
    this.settle();
    // 시간 초과처럼 아직 응답을 받고 있는 경우 요청도 끊는다.
    if (current?.runId === runId) current.abort.abort();
    this.update(runId, (r) => ({ ...r, status: "error", slow: false, error }));
    this.active.set(null);
  }

  private findRun(runId: number): AiRun | null {
    for (const m of this.messages.get()) {
      if (m.role === "assistant" && m.run.id === runId) return m.run;
    }
    return null;
  }

  private closeReview(): void {
    this.active.set(null);
    this.showOriginal.set(false);
    this.sheet.focus();
  }

  /** 진행 중 표시를 정리한다(타이머 해제, 진행 중 요청 없음). */
  private settle(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.slowTimer = this.idleTimer = null;
    this.inflight = null;
  }

  /** 이벤트가 올 때마다 다시 잰다. 늦으면 표시하고, 너무 오래 없으면 중단한다. */
  private armWatchdog(): void {
    const runId = this.inflight?.runId;
    if (runId === undefined) return;
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.slowTimer = setTimeout(() => {
      if (this.inflight?.runId === runId) this.update(runId, (r) => ({ ...r, slow: true }));
    }, SLOW_AFTER_MS);
    this.idleTimer = setTimeout(() => {
      if (this.inflight?.runId === runId) this.fail(runId, aiError("timeout"));
    }, IDLE_TIMEOUT_MS);
  }

  private update(runId: number, change: (run: AiRun) => AiRun): void {
    this.messages.set((list) =>
      list.map((m) =>
        m.role === "assistant" && m.run.id === runId ? { ...m, run: change(m.run) } : m,
      ),
    );
    // 생성 중인 실행이면 미리보기도 같이 갱신한다.
    const active = this.active.get();
    const updated = this.findRun(runId);
    if (updated && active?.id === runId && RUNNING.has(active.status)) this.active.set(updated);
  }

  /** 시트의 비어 있지 않은 셀(행 → 열 순서). AI가 참고할 내용이다. */
  private sheetCells(): AiCell[] {
    const cells: Array<AiCell & { coord: CellCoord }> = [];
    valuesOf(this.doc).forEach((value, key) => {
      const coord = parseA1(key);
      if (coord && value !== "") cells.push({ coord, cell: key, value });
    });
    cells.sort((a, b) => a.coord.row - b.coord.row || a.coord.col - b.coord.col);
    return cells
      .slice(0, AI_LIMITS.cells)
      .map(({ cell, value }) => ({ cell, value: value.slice(0, AI_LIMITS.cellValue) }));
  }

  /** 이전 대화(최근 것만). 모델이 "방금 그거 되돌려줘" 같은 이어지는 요청을 이해하게 한다. */
  private history(): AiHistoryItem[] {
    const items: AiHistoryItem[] = [];
    for (const m of this.messages.get()) {
      if (m.role === "user") items.push({ role: "user", text: m.text });
      else if (m.run.text) items.push({ role: "assistant", text: m.run.text });
    }
    return items
      .slice(-AI_LIMITS.history)
      .map((item) => ({ ...item, text: item.text.slice(0, AI_LIMITS.historyText) }));
  }
}

/** 제안 하나를 더한다. 범위 밖이면 빼고, 같은 셀이면 바꾸고, 원래 값과 같으면 제안에서 지운다. */
function addProposal(run: AiRun, cell: string, value: string): AiRun {
  const coord = parseA1(cell);
  const base = { ...run, connected: true, slow: false, status: "streaming" as const };
  if (!coord || !isInSheet(coord) || (run.scope && !rangeContains(run.scope, coord))) {
    return { ...base, skipped: run.skipped + 1 };
  }
  const key = toA1(coord);
  const before = run.base.get(key) ?? "";
  const after = value.slice(0, AI_LIMITS.cellValue);
  const existing = run.proposals.findIndex((p) => p.cell === key);
  if (after === before) {
    return { ...base, proposals: run.proposals.filter((p) => p.cell !== key) };
  }
  const proposal: AiProposal = { coord, cell: key, before, after };
  const proposals =
    existing >= 0
      ? run.proposals.map((p, i) => (i === existing ? proposal : p))
      : [...run.proposals, proposal];
  return { ...base, proposals };
}
