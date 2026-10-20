import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

// [결정] "서버 없이 브라우저 API만" 조건이라 provider를 직접 만들되, 메시지 형식은 y-websocket과 맞춰 서버로 넓힐 길을 남김.
/**
 * BroadcastChannel로 같은 출처의 탭끼리 Y.Doc과 awareness를 동기화함.
 * 메시지 형식은 y-websocket과 같은 y-protocols 인코딩임. 그래서 네트워크로 옮길 때 이 클래스만 WebsocketProvider로 바꾸면 됨.
 * 한 번 보내면 모든 탭이 받는 구조라 SyncStep2 답장도 모든 탭에 감. 같은 업데이트를 여러 번 받아도 결과가 같아서(멱등) 문제없음.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export interface BroadcastChannelProviderOptions {
  awareness?: awarenessProtocol.Awareness;
}

export class BroadcastChannelProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly channelName: string;
  private readonly channel: BroadcastChannel;
  private readonly ownsAwareness: boolean;
  private destroyed = false;

  constructor(name: string, doc: Y.Doc, options: BroadcastChannelProviderOptions = {}) {
    this.doc = doc;
    this.ownsAwareness = !options.awareness;
    this.awareness = options.awareness ?? new awarenessProtocol.Awareness(doc);
    this.channelName = `spread-sheet:${name}`;
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (event: MessageEvent) => this.receive(event.data);

    doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.announce();
  }

  /** 합류 절차를 다시 밟아 놓친 변경과 참여 상태를 받음. bfcache에서 복원된 탭은 멈춰 있던 동안의 메시지를 놓쳤기 때문. */
  resync(): void {
    this.announce();
  }

  /** 합류 알림. 문서 동기화(Step1·Step2)를 시작하고, 다른 탭의 참여 상태를 요청하고, 내 상태를 알림. */
  private announce(): void {
    // Step1: "어느 탭의 변경을 몇 개까지 가지고 있는지"만 담음(상태 벡터, ex: { 탭A: 3개, 탭B: 0개 })
    const step1 = encoding.createEncoder();
    encoding.writeVarUint(step1, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(step1, this.doc);
    this.post(encoding.toUint8Array(step1));

    // Step2: 실제 변경 내용
    const step2 = encoding.createEncoder();
    encoding.writeVarUint(step2, MESSAGE_SYNC);
    syncProtocol.writeSyncStep2(step2, this.doc);
    this.post(encoding.toUint8Array(step2));

    const query = encoding.createEncoder();
    encoding.writeVarUint(query, MESSAGE_QUERY_AWARENESS);
    this.post(encoding.toUint8Array(query));

    if (this.awareness.getLocalState() !== null) this.postOwnAwareness();
  }

  /** 채널에서 받은 메시지를 종류(문서 동기화·참여 상태·참여 상태 요청)에 따라 처리함. */
  private receive(data: unknown): void {
    if (this.destroyed || !(data instanceof Uint8Array)) return;
    try {
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case MESSAGE_SYNC: {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
          // SyncStep1을 받았을 때만 reply에 SyncStep2가 담긴다.
          if (encoding.length(reply) > 1) this.post(encoding.toUint8Array(reply));
          break;
        }
        case MESSAGE_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            this,
          );
          break;
        case MESSAGE_QUERY_AWARENESS:
          if (this.awareness.getLocalState() !== null) this.postOwnAwareness();
          break;
        default:
          console.warn(`[BroadcastChannelProvider] Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error("[BroadcastChannelProvider] Failed to handle message", error);
    }
  }

  // [기능 설명: 동기화·저장 2/5] 내 탭의 변경만 다른 탭에 보냄. 받은 변경은 다시 보내지 않음.
  /** 이 탭의 문서 변경을 다른 탭에 방송함. */
  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return; // 다른 탭에서 받은 변경은 다시 방송하지 않는다.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.post(encoding.toUint8Array(encoder));
  };

  // [기능 설명: 참여자 표시 2/6] 참여 상태도 자기 것만 보냄. 다른 탭의 상태를 대신 보내면 떠난 사람이 되살아남.
  /** 내 참여 상태가 바뀌면 방송함. 각 탭은 자기 상태만 보냄. 다른 탭의 상태를 중계하면 지운 상태가 다시 퍼져, 살아 있는 참여자가 목록에서 깜빡일 수 있음. */
  private handleAwarenessUpdate = (
    { added, updated, removed }: AwarenessChanges,
    origin: unknown,
  ): void => {
    if (origin === this) return;
    const self = this.awareness.clientID;
    if (added.includes(self) || updated.includes(self) || removed.includes(self)) {
      this.postOwnAwareness();
    }
  };

  /** 내 참여 상태만 인코딩해 방송함. */
  private postOwnAwareness(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]),
    );
    this.post(encoding.toUint8Array(encoder));
  }

  /** 채널에 메시지를 올림. 정리된 뒤에는 보내지 않음. */
  private post(message: Uint8Array): void {
    if (!this.destroyed) this.channel.postMessage(message);
  }

  /** 탭을 떠날 때. 내 참여 상태를 지워 다른 탭 목록에서 바로 빠지게 하고 채널을 닫음. */
  destroy(): void {
    if (this.destroyed) return;
    // destroyed 표시 전에 지워야 제거 메시지가 방송된다.
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      "provider-destroy",
    );
    this.destroyed = true;
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    if (this.ownsAwareness) this.awareness.destroy();
    this.channel.close();
  }
}
