import { GameState } from "@/GameState";
import { NetMode } from "@/enums/engine/NetMode";
import { IPCMessageType } from "@/enums/server/ipc/IPCMessageType";
import { IPCMessageTypeSession } from "@/enums/server/ipc/IPCMessageTypeSession";
import { IPCMessage } from "@/server/ipc/IPCMessage";
import { CoopSession } from "@/network/CoopSession";
import { CoopHostReplicator } from "@/network/CoopHostReplicator";
import { CoopClientMirror } from "@/network/CoopClientMirror";
import {
  COOP_PROTOCOL_VERSION, COOP_DEFAULT_PORT, COOP_DEFAULT_SESSION,
  ICoopControlMessage
} from "@/network/CoopProtocol";

/**
 * NetworkManager — co-op/netplay singleton (all-static, like every other
 * manager). Owns the CoopSession transport, the game-level handshake, and the
 * per-frame network pump. The HOST runs the authoritative sim; CLIENTS are
 * thin (render + input + own-character UI).
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file NetworkManager.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */

export interface ICoopPeer {
  peerId: number;
  name: string;
  /** Game-level handshake completed (Session.Hello received). */
  ready: boolean;
  /** Last measured round-trip time in ms (-1 = not yet measured). */
  rtt: number;
  /** ModuleObject.id of the party member this peer controls (-1 = none). */
  controlledObjectId: number;
}

const PING_INTERVAL_MS = 2000;

export class NetworkManager {

  static session: CoopSession | undefined;
  /** Our peer id (host = 0). -1 when not connected. */
  static peerId: number = -1;
  /** Host-side: connected client peers by peerId. */
  static peers: Map<number, ICoopPeer> = new Map();
  /** Client-side: module resref reported by the host in Session.Welcome. */
  static hostModule: string = '';
  /** Client-side: resolves when the host's Session.Welcome arrives. */
  static #welcomeResolve: ((msg: IPCMessage) => void) | undefined;
  static #pingTimer: number = 0;
  static #pendingPingSentAt: number = -1;
  /** Client-side rtt to host in ms (-1 = not yet measured). */
  static rtt: number = -1;

  static eventListeners: {[key: string]: Function[]} = {};

  /**
   * Background ticker: rAF stops in hidden tabs, which would freeze the
   * host's sim (and a client's mirror) the moment the window loses
   * visibility. Worker timers are not throttled, so while a net session is
   * active a tiny worker pumps GameState.UpdateTick at ~20Hz whenever the
   * document is hidden.
   */
  static #bgTicker: Worker | undefined;

  static #startBackgroundTicker(){
    if(this.#bgTicker){ return; }
    try{
      const src = `setInterval(function(){ postMessage(0); }, 50);`;
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      worker.onmessage = () => {
        if(document.hidden && GameState.netMode != NetMode.NONE){
          GameState.UpdateTick();
        }
      };
      this.#bgTicker = worker;
    }catch(e){
      console.warn('NetworkManager: background ticker unavailable', e);
    }
  }

  static #stopBackgroundTicker(){
    if(this.#bgTicker){
      this.#bgTicker.terminate();
      this.#bgTicker = undefined;
    }
  }

  static addEventListener(event: string, cb: Function){
    (this.eventListeners[event] = this.eventListeners[event] || []).push(cb);
  }

  static removeEventListener(event: string, cb: Function){
    const list = this.eventListeners[event];
    if(!list){ return; }
    const idx = list.indexOf(cb);
    if(idx >= 0){ list.splice(idx, 1); }
  }

  static processEventListener(event: string, args: any[] = []){
    const list = this.eventListeners[event];
    if(!list){ return; }
    for(let i = 0; i < list.length; i++){
      try{ list[i](...args); }catch(e){ console.error(e); }
    }
  }

  static isHost(): boolean {
    return GameState.netMode == NetMode.HOST;
  }

  static isClient(): boolean {
    return GameState.netMode == NetMode.CLIENT;
  }

  static isActive(): boolean {
    return GameState.netMode != NetMode.NONE && !!this.session?.connected;
  }

  /** Default relay address: same hostname the game was served from, relay port. */
  static defaultAddress(): string {
    const hostname = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
    return `ws://${hostname}:${COOP_DEFAULT_PORT}`;
  }

  /**
   * Host a co-op session: connect to the relay as the authoritative host.
   * The current (or later-loaded) module keeps simulating locally as normal.
   */
  static async host(address: string = this.defaultAddress(), sessionCode: string = COOP_DEFAULT_SESSION): Promise<void> {
    if(this.session){ this.disconnect(); }
    const session = new CoopSession('host');
    session.onMessage = (senderPeerId, msg) => this.handleMessage(senderPeerId, msg);
    session.onControl = (ctrl) => this.handleControl(ctrl);
    session.onDisconnect = (reason) => this.handleDisconnect(reason);
    await session.connect(address, sessionCode);
    this.session = session;
    this.peerId = session.peerId;
    this.peers.clear();
    GameState.netMode = NetMode.HOST;
    this.#startBackgroundTicker();
    console.log(`NetworkManager: hosting co-op session '${sessionCode}' via ${address}`);
    this.processEventListener('connected', [this.peerId]);
  }

  /**
   * Join a co-op session as a thin client. Resolves once the HOST answers our
   * Session.Hello with Session.Welcome (i.e. game-level handshake complete).
   * If the host is not connected yet, we wait for it (relay 'joined' room).
   */
  static async join(address: string = this.defaultAddress(), sessionCode: string = COOP_DEFAULT_SESSION, clientName: string = 'player'): Promise<IPCMessage> {
    if(this.session){ this.disconnect(); }
    const session = new CoopSession('client');
    session.onMessage = (senderPeerId, msg) => this.handleMessage(senderPeerId, msg);
    session.onControl = (ctrl) => this.handleControl(ctrl);
    session.onDisconnect = (reason) => this.handleDisconnect(reason);
    await session.connect(address, sessionCode);
    this.session = session;
    this.peerId = session.peerId;
    GameState.netMode = NetMode.CLIENT;
    this.#startBackgroundTicker();
    console.log(`NetworkManager: joined relay session '${sessionCode}' as peer ${this.peerId}; awaiting host welcome...`);

    const welcome = new Promise<IPCMessage>((resolve) => {
      this.#welcomeResolve = resolve;
    });
    session.sendToHost(
      new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.Hello)
        .addInt(COOP_PROTOCOL_VERSION)
        .addString(clientName)
    );
    const msg = await welcome;
    this.hostModule = msg.stringAt(2);
    console.log(`NetworkManager: welcomed by host (peer ${this.peerId}, hostModule '${this.hostModule}')`);
    this.processEventListener('connected', [this.peerId]);
    return msg;
  }

  static disconnect(): void {
    this.#stopBackgroundTicker();
    if(this.session){
      this.session.disconnect();
      this.session = undefined;
    }
    this.peers.clear();
    this.peerId = -1;
    this.hostModule = '';
    this.rtt = -1;
    this.#welcomeResolve = undefined;
    CoopHostReplicator.reset();
    CoopClientMirror.reset();
    GameState.netMode = NetMode.NONE;
    this.processEventListener('disconnected', []);
  }

  /**
   * Per-frame network pump — called from GameState.Update. Drives keepalive
   * pings; later phases flush replication deltas here.
   */
  static update(delta: number): void {
    if(!this.isActive()){ return; }
    this.#pingTimer += delta * 1000;
    if(this.#pingTimer >= PING_INTERVAL_MS){
      this.#pingTimer = 0;
      const now = performance.now() | 0;
      const ping = new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.Ping).addInt(now);
      if(this.isClient()){
        this.#pendingPingSentAt = now;
        this.session?.sendToHost(ping);
      }else{
        this.#pendingPingSentAt = now;
        this.session?.broadcast(ping);
      }
    }

    if(this.isHost()){
      CoopHostReplicator.update(delta);
    }else if(this.isClient()){
      CoopClientMirror.update(delta);
    }
  }

  /** Relay-control messages (transport-level joins/leaves). */
  static handleControl(ctrl: ICoopControlMessage): void {
    switch(ctrl.event){
      case 'joined':
        if(this.isHost() && typeof ctrl.peerId === 'number'){
          this.peers.set(ctrl.peerId, { peerId: ctrl.peerId, name: '', ready: false, rtt: -1, controlledObjectId: -1 });
          console.log(`NetworkManager: peer ${ctrl.peerId} connected (awaiting hello)`);
          this.processEventListener('peer-joined', [ctrl.peerId]);
        }
        break;
      case 'left':
        if(this.isHost() && typeof ctrl.peerId === 'number'){
          this.peers.delete(ctrl.peerId);
          CoopHostReplicator.onPeerLeft(ctrl.peerId);
          console.log(`NetworkManager: peer ${ctrl.peerId} left`);
          this.processEventListener('peer-left', [ctrl.peerId]);
        }
        break;
      case 'host-left':
        console.warn('NetworkManager: host left the session');
        this.processEventListener('host-left', []);
        break;
      case 'error':
        console.error('NetworkManager: relay error:', ctrl.message);
        break;
    }
  }

  static handleDisconnect(reason: string): void {
    console.warn(`NetworkManager: disconnected (${reason})`);
    this.disconnect();
  }

  /** Decoded IPCMessage dispatch — the co-op message switchboard. */
  static handleMessage(senderPeerId: number, msg: IPCMessage): void {
    switch(msg.type){
      case IPCMessageType.Session:
        this.handleSessionMessage(senderPeerId, msg);
        break;
      case IPCMessageType.Command:
        // Host-side player intent — implemented in phase 3 (owned movement).
        break;
      case IPCMessageType.Object:
      case IPCMessageType.Module:
        if(this.isClient()){
          CoopClientMirror.handleMessage(msg);
        }
        break;
      default:
        console.warn(`NetworkManager: unhandled message type 0x${msg.type.toString(16)}.${msg.subType}`);
    }
  }

  static handleSessionMessage(senderPeerId: number, msg: IPCMessage): void {
    switch(msg.subType){
      case IPCMessageTypeSession.Hello: {
        if(!this.isHost()){ break; }
        const version = msg.intAt(0);
        const name = msg.stringAt(1);
        const peer = this.peers.get(senderPeerId) ??
          { peerId: senderPeerId, name: '', ready: false, rtt: -1, controlledObjectId: -1 };
        peer.name = name;
        peer.ready = version == COOP_PROTOCOL_VERSION;
        this.peers.set(senderPeerId, peer);
        if(!peer.ready){
          console.warn(`NetworkManager: peer ${senderPeerId} protocol mismatch (theirs ${version}, ours ${COOP_PROTOCOL_VERSION})`);
        }
        const partySize = GameState.PartyManager?.party?.length ?? 0;
        this.session?.send(senderPeerId,
          new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.Welcome)
            .addInt(senderPeerId)
            .addInt(COOP_PROTOCOL_VERSION)
            .addString(GameState.module?.filename ?? '')
            .addInt(partySize)
        );
        console.log(`NetworkManager: peer ${senderPeerId} ('${name}') completed handshake`);
        this.processEventListener('peer-ready', [senderPeerId]);
        //Phase 2: stream the party + module so the peer can mirror the world.
        CoopHostReplicator.onPeerReady(senderPeerId);
        break;
      }
      case IPCMessageTypeSession.Welcome: {
        if(!this.isClient()){ break; }
        if(this.#welcomeResolve){
          const resolve = this.#welcomeResolve;
          this.#welcomeResolve = undefined;
          resolve(msg);
        }
        break;
      }
      case IPCMessageTypeSession.Ping: {
        const pong = new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.Pong).addInt(msg.intAt(0));
        if(this.isHost()){
          this.session?.send(senderPeerId, pong);
        }else{
          this.session?.sendToHost(pong);
        }
        break;
      }
      case IPCMessageTypeSession.Pong: {
        const sentAt = msg.intAt(0);
        const rtt = (performance.now() | 0) - sentAt;
        if(this.isHost()){
          const peer = this.peers.get(senderPeerId);
          if(peer){ peer.rtt = rtt; }
        }else{
          this.rtt = rtt;
        }
        break;
      }
      case IPCMessageTypeSession.PartyMember: {
        if(this.isClient()){
          CoopClientMirror.handleMessage(msg);
        }
        break;
      }
      case IPCMessageTypeSession.ClientReady: {
        if(this.isHost()){
          CoopHostReplicator.onClientReady(senderPeerId);
        }
        break;
      }
      default:
        // ClaimSlot/SlotAssigned/SetPause/SlotReleased land in phases 3-4.
        break;
    }
  }
}
