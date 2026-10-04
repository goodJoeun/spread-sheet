import type * as Y from "yjs";
import type { AiActivity } from "@/lib/collab/presence-state";
import { intersectRanges, rangeToA1, type CellCoord, type CellRange } from "@/lib/sheet/address";
import { EditOrigin, valuesOf, writeValues } from "@/lib/sheet/document";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import type { Selection } from "@/lib/sheet/selection";
import { createStore } from "@/lib/store";
import {
  aiActivityOf,
  boundingRange,
  evaluateProposals,
  summarize,
  writable,
  type ProposalState,
} from "./coedit";
import {
  AI_LIMITS,
  aiError,
  type AiEditRequest,
  type AiErrorInfo,
  type AiStreamEvent,
} from "./protocol";
import { conversationHistory, snapshotCells } from "./request";
import { applyProgress, createRun, finishRun, isRunning, type AiMessage, type AiRun } from "./run";
import { AiRequestError, type AiTransport } from "./transport";

/**
 * AI 결과는 제안으로만 들고 있다가 적용할 때 한 트랜잭션으로 쓴다. 그래서 실행 취소 한 번으로 모두 되돌아간다.
 * 요청 시점 값(base)과 달라진 셀은 다른 참여자가 바꾼 것으로 보고 기본으로 건너뛴다.
 */

export const SLOW_AFTER_MS = 5_000;
export const IDLE_TIMEOUT_MS = 60_000;

export interface AiSheetBinding {
  commitEdit(): void;
  select(selection: Selection, reveal?: CellCoord | null): void;
  reveal(coord: CellCoord): void;
  focus(): void;
}

export interface AiPresenceBinding {
  setAi(activity: AiActivity | null): void;
}

export class AiController {
  readonly messages = createStore<AiMessage[]>([]);
  /** 미리보기에 그릴 실행(생성 중이거나 검토 중). 없으면 null */
  readonly active = createStore<AiRun | null>(null);
  readonly showOriginal = createStore(false);
  /** 다음 요청에 쓸 모델. null이면 서버 기본 모델 */
  readonly model = createStore<string | null>(null);
  /** 충돌한 셀 중 덮어쓰기로 고른 것: 셀 → 고를 때 본 값 */
  readonly overwrites = createStore<ReadonlyMap<string, string>>(new Map());

  private nextId = 1;
  private inflight: { runId: number; abort: AbortController } | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private publishedActivity = "";

  constructor(
    private readonly doc: Y.Doc,
    private readonly sheet: AiSheetBinding,
    private readonly transport: AiTransport,
    private readonly presence: AiPresenceBinding = { setAi() {} },
  ) {}

  /** 생성자에서 구독하지 않는다. React 개발 모드의 정리 후 재연결에서 구독이 새거나 끊기지 않게. */
  connect(): () => void {
    this.publishedActivity = "";
    this.publishActivity();
    const off = this.active.subscribe(() => this.publishActivity());
    return () => {
      off();
      this.publishedActivity = "";
      this.presence.setAi(null);
    };
  }

  /** 저장하지 않고 매번 지금 값과 비교한다. 바꾼 사람이 원래 값으로 되돌리면 충돌도 저절로 풀린다. */
  states(run: AiRun | null = this.active.get()): ProposalState[] {
    if (!run) return [];
    const values = valuesOf(this.doc);
    return evaluateProposals(
      run.proposals,
      (cell) => values.get(cell) ?? "",
      this.overwrites.get(),
    );
  }

  setOverwrite(cell: string, overwrite: boolean): void {
    const state = this.states().find((s) => s.proposal.cell === cell);
    if (!state || state.status !== "conflict") return;
    this.overwrites.set((prev) => {
      const next = new Map(prev);
      if (overwrite) next.set(cell, state.current);
      else next.delete(cell);
      return next;
    });
  }

  setOverwriteAll(overwrite: boolean): void {
    const conflicts = this.states().filter((s) => s.status === "conflict");
    this.overwrites.set((prev) => {
      const next = new Map(prev);
      for (const s of conflicts) {
        if (overwrite) next.set(s.proposal.cell, s.current);
        else next.delete(s.proposal.cell);
      }
      return next;
    });
  }

  isBusy(): boolean {
    const run = this.active.get();
    return this.inflight !== null || run?.status === "review";
  }

  send(instruction: string, scope: CellRange | null): boolean {
    const text = instruction.trim().slice(0, AI_LIMITS.instruction);
    if (!text || this.isBusy()) return false;

    const range = scope ? intersectRanges(scope, SHEET_RANGE) : null;
    const cells = snapshotCells(this.doc);
    const model = this.model.get();
    const request: AiEditRequest = {
      instruction: text,
      range: range ? rangeToA1(range) : null,
      cells,
      history: conversationHistory(this.messages.get()),
      ...(model ? { model } : {}),
    };
    const userId = this.nextId++;
    const run = createRun({
      id: this.nextId++,
      instruction: text,
      scope: range,
      model,
      base: new Map(cells.map((c) => [c.cell, c.value])),
    });
    this.messages.set((list) => [
      ...list,
      { id: userId, role: "user", text, scope: range },
      { id: run.id, role: "assistant", run },
    ]);
    this.showOriginal.set(false);
    this.overwrites.set(new Map());
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
          this.fail(run.id, aiError("network", "stream_dropped"));
        }
      })
      .catch((error: unknown) => {
        // 중단·시간 초과·완료로 이미 정리된 실행이면 무시한다.
        if (this.inflight?.runId !== run.id) return;
        this.fail(run.id, error instanceof AiRequestError ? error.info : aiError("network"));
      });
    return true;
  }

  cancel(): void {
    const current = this.inflight;
    if (!current) return;
    this.settle();
    current.abort.abort();
    this.update(current.runId, (run) => ({ ...run, status: "cancelled", slow: false }));
    this.active.set(null);
  }

  apply(): void {
    const run = this.active.get();
    if (!run || run.status !== "review" || run.proposals.length === 0) return;

    // 내가 입력 중이던 값도 먼저 확정한다. 그 셀이 대상이면 충돌로 판단된다.
    this.sheet.commitEdit();
    // 화면에 보이던 상태가 아니라 지금 값으로 다시 판단한다. 판단과 쓰기를 같은 동기 코드에서 하므로
    // 그 사이에 다른 탭의 변경(BroadcastChannel 메시지)이 끼어들 수 없다.
    const states = this.states(run);
    const writes = states.filter(writable).map((s) => s.proposal);
    const skipped = summarize(states).skipped;

    const box = boundingRange(writes);
    if (box) {
      // 적용 직전의 선택을 바뀐 범위로 옮겨 둔다. 실행 취소하면 이 범위로 돌아온다.
      this.sheet.select({ anchor: box.start, focus: box.end, active: box.start }, box.start);
      writeValues(
        this.doc,
        writes.map((p) => ({ coord: p.coord, value: p.after })),
        EditOrigin.Ai,
      );
    }

    this.update(run.id, (r) => ({
      ...r,
      status: "applied",
      result: { applied: writes.length, skipped },
    }));
    this.closeReview();
  }

  regenerate(): boolean {
    const run = this.active.get();
    if (!run || run.status !== "review") return false;
    this.discard();
    return this.send(run.instruction, run.scope);
  }

  discard(): void {
    const run = this.active.get();
    if (!run || run.status !== "review") return;
    this.update(run.id, (r) => ({ ...r, status: "discarded" }));
    this.closeReview();
  }

  /** 모델은 원래 요청이 아니라 지금 고른 것으로 보낸다. */
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

  /** @returns 실행이 끝났으면 true */
  private handleEvent(runId: number, event: AiStreamEvent): boolean {
    if (event.type === "done") {
      this.finish(runId);
      return true;
    }
    if (event.type === "error") {
      this.fail(runId, event.error);
      return true;
    }
    const hadProposals = (this.findRun(runId)?.proposals.length ?? 0) > 0;
    this.update(runId, (r) => applyProgress(r, event));
    // 첫 제안이 오면 그 셀을 화면에 보여 준다. 다른 곳을 보고 있어도 생성 과정을 볼 수 있게.
    const first = this.findRun(runId)?.proposals[0];
    if (!hadProposals && first) this.sheet.reveal(first.coord);
    return false;
  }

  private finish(runId: number): void {
    this.settle();
    this.update(runId, finishRun);
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
    this.overwrites.set(new Map());
    this.sheet.focus();
  }

  /** 상태나 범위가 바뀔 때만 알린다. 글자가 들어올 때마다 다른 탭에 보내지 않도록. */
  private publishActivity(): void {
    const activity = aiActivityOf(this.active.get());
    const key = activity
      ? `${activity.status}:${activity.range ? rangeToA1(activity.range) : "*"}`
      : "";
    if (key === this.publishedActivity) return;
    this.publishedActivity = key;
    this.presence.setAi(activity);
  }

  private settle(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.slowTimer = this.idleTimer = null;
    this.inflight = null;
  }

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
    const active = this.active.get();
    const updated = this.findRun(runId);
    if (updated && active?.id === runId && isRunning(active)) this.active.set(updated);
  }
}
