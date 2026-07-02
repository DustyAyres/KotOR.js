import { IPCMessage } from "@/server/ipc/IPCMessage";
import {
  BROADCAST_PEER_ID, CONTROL_PEER_ID, HOST_PEER_ID,
  COOP_DEFAULT_SESSION, ICoopControlMessage, CoopRole
} from "@/network/CoopProtocol";

/**
 * CoopSession — one WebSocket connection to the co-op relay
 * (scripts/coop-server.js), speaking the relay envelope:
 * [peerId:u16 LE][IPCMessage bytes]. Game semantics live above this in
 * NetworkManager; this class only connects, frames, and dispatches.
 */
export class CoopSession {

  role: CoopRole;
  sessionCode: string = COOP_DEFAULT_SESSION;
  /** Our peer id as assigned by the relay (host = 0). -1 until welcomed. */
  peerId: number = -1;
  ws: WebSocket | undefined;
  connected: boolean = false;

  /** A decoded IPCMessage arrived. senderPeerId is HOST_PEER_ID on clients. */
  onMessage?: (senderPeerId: number, msg: IPCMessage) => void;
  /** A relay-control JSON message arrived (joined/left/host-left/error). */
  onControl?: (ctrl: ICoopControlMessage) => void;
  /** The socket closed (after a successful connect). */
  onDisconnect?: (reason: string) => void;

  constructor(role: CoopRole){
    this.role = role;
  }

  /**
   * Connect to the relay and wait for its 'welcome' control message (which
   * assigns our peerId). Rejects on error/close before welcome.
   */
  connect(address: string, sessionCode: string = COOP_DEFAULT_SESSION): Promise<ICoopControlMessage> {
    this.sessionCode = sessionCode;
    const url = `${address}/?role=${this.role}&session=${encodeURIComponent(sessionCode)}`;
    return new Promise((resolve, reject) => {
      let welcomed = false;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onmessage = (event: MessageEvent) => {
        if(!(event.data instanceof ArrayBuffer) || event.data.byteLength < 2){ return; }
        const frame = new Uint8Array(event.data);
        const view = new DataView(event.data);
        const peerId = view.getUint16(0, true);
        const payload = frame.subarray(2);

        if(peerId == CONTROL_PEER_ID){
          let ctrl: ICoopControlMessage;
          try{
            ctrl = JSON.parse(new TextDecoder().decode(payload));
          }catch(e){
            console.error('CoopSession: bad control frame', e);
            return;
          }
          if(!welcomed){
            if(ctrl.event == 'welcome'){
              welcomed = true;
              this.connected = true;
              this.peerId = ctrl.peerId ?? -1;
              resolve(ctrl);
            }else if(ctrl.event == 'error'){
              reject(new Error(ctrl.message || 'relay error'));
              try{ ws.close(); }catch(e){ /* already closing */ }
            }
            return;
          }
          if(typeof this.onControl === 'function'){ this.onControl(ctrl); }
          return;
        }

        if(typeof this.onMessage === 'function'){
          try{
            this.onMessage(peerId, IPCMessage.fromBuffer(payload));
          }catch(e){
            console.error('CoopSession: failed to decode IPCMessage', e);
          }
        }
      };

      ws.onerror = () => {
        if(!welcomed){ reject(new Error(`CoopSession: failed to connect to ${address}`)); }
      };

      ws.onclose = (event: CloseEvent) => {
        const wasConnected = this.connected;
        this.connected = false;
        this.ws = undefined;
        if(!welcomed){
          reject(new Error(`CoopSession: closed before welcome (${event.code})`));
          return;
        }
        if(wasConnected && typeof this.onDisconnect === 'function'){
          this.onDisconnect(event.reason || `code ${event.code}`);
        }
      };
    });
  }

  /**
   * Send an IPCMessage. For the host, targetPeerId selects the recipient
   * client (BROADCAST_PEER_ID = all). For clients the relay always routes to
   * the host regardless of the id.
   */
  send(targetPeerId: number, msg: IPCMessage): void {
    if(!this.ws || this.ws.readyState !== WebSocket.OPEN){ return; }
    const payload = msg.toBuffer();
    const frame = new Uint8Array(2 + payload.length);
    new DataView(frame.buffer).setUint16(0, targetPeerId, true);
    frame.set(payload, 2);
    this.ws.send(frame);
  }

  sendToHost(msg: IPCMessage): void {
    this.send(HOST_PEER_ID, msg);
  }

  broadcast(msg: IPCMessage): void {
    this.send(BROADCAST_PEER_ID, msg);
  }

  disconnect(): void {
    this.connected = false;
    if(this.ws){
      try{ this.ws.close(); }catch(e){ /* already closing */ }
      this.ws = undefined;
    }
  }
}
