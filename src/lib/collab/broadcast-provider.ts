import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

/**
 * BroadcastChannel로 같은 출처(origin)의 탭끼리 Y.Doc과 awareness를 동기화한다.
 *
 * 메시지 형식은 y-websocket과 같은 y-protocols 인코딩을 쓴다. 그래서 네트워크 동기화로 옮길 때
 * 이 클래스를 WebsocketProvider로 바꾸기만 하면 되고, 나머지 코드는 그대로 둘 수 있다.
 *
 * 합류 절차
 *  1. 새 탭이 SyncStep1(내 state vector)과 SyncStep2(내 전체 상태)를 방송한다.
 *  2. 기존 탭은 SyncStep1에 대한 답으로 새 탭에 없는 변경(SyncStep2)을 방송한다.
 *  3. 이후 각 탭은 자기 로컬 변경을 Update 메시지로 방송한다.
 * BroadcastChannel은 1:N 방송이라 답장도 모두에게 가지만, Yjs 업데이트는 멱등이라 안전하다.
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

  /**
   * 다시 동기화한다. 뒤로/앞으로 캐시(bfcache)에서 복원된 탭은 멈춰 있던 동안의 메시지를 받지 못했으므로
   * 합류할 때와 같은 절차로 빠진 변경과 참여자 정보를 다시 받는다.
   */
  resync(): void {
    this.announce();
  }

  /** 합류 알림: 동기화를 시작하고, 다른 탭의 awareness를 요청하고, 내 awareness를 알린다. */
  private announce(): void {
    const step1 = encoding.createEncoder();
    encoding.writeVarUint(step1, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(step1, this.doc);
    this.post(encoding.toUint8Array(step1));

    const step2 = encoding.createEncoder();
    encoding.writeVarUint(step2, MESSAGE_SYNC);
    syncProtocol.writeSyncStep2(step2, this.doc);
    this.post(encoding.toUint8Array(step2));

    const query = encoding.createEncoder();
    encoding.writeVarUint(query, MESSAGE_QUERY_AWARENESS);
    this.post(encoding.toUint8Array(query));

    if (this.awareness.getLocalState() !== null) this.postOwnAwareness();
  }

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

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return; // 다른 탭에서 받은 변경은 다시 방송하지 않는다.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.post(encoding.toUint8Array(encoder));
  };

  /**
   * 각 탭은 자기 awareness만 방송한다. 다른 탭의 상태를 중계하면, 타임아웃으로 지운 상태가
   * 다시 퍼지면서 살아 있는 참여자가 목록에서 깜빡일 수 있다.
   */
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

  private postOwnAwareness(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]),
    );
    this.post(encoding.toUint8Array(encoder));
  }

  private post(message: Uint8Array): void {
    if (!this.destroyed) this.channel.postMessage(message);
  }

  /** 탭을 떠날 때 호출한다. 내 awareness를 지워 다른 탭의 참여자 목록에서 바로 사라지게 한다. */
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
