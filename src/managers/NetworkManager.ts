import { GameState } from "@/GameState";
import { NetMode } from "@/enums/engine/NetMode";
import { EngineState } from "@/enums/engine/EngineState";
import { AutoPauseState } from "@/enums/engine/AutoPauseState";
import { IPCMessageType } from "@/enums/server/ipc/IPCMessageType";
import { IPCMessageTypeSession } from "@/enums/server/ipc/IPCMessageTypeSession";
import { IPCMessageTypeCommand } from "@/enums/server/ipc/IPCMessageTypeCommand";
import { IPCMessage } from "@/server/ipc/IPCMessage";
import { TURN_SPEED_FAST } from "@/engine/TurnSpeeds";
import type { ModuleCreature } from "@/module";
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

export interface ICoopMoveIntent {
  /** World-space heading in radians. */
  heading: number;
  run: boolean;
  /** performance.now() the intent was (re)received; stale intents stop applying. */
  receivedAt: number;
  /** Whether the initial clearAllActions has run for this movement burst. */
  started: boolean;
}

export interface ICoopPeer {
  peerId: number;
  name: string;
  /** Game-level handshake completed (Session.Hello received). */
  ready: boolean;
  /** Last measured round-trip time in ms (-1 = not yet measured). */
  rtt: number;
  /** ModuleObject.id of the party member this peer controls (-1 = none). */
  controlledObjectId: number;
  /** Host-side: the claimed creature (resolved on ClaimSlot). */
  controlledCreature?: ModuleCreature;
  /** Host-side: latest held-key steering intent from this peer. */
  moveIntent?: ICoopMoveIntent;
}

const PING_INTERVAL_MS = 2000;
/** MoveDir keepalive: client re-sends while held; host stops applying after this. */
const MOVE_INTENT_STALE_MS = 400;
const MOVE_SEND_INTERVAL_MS = 100;
const MOVE_HEADING_EPSILON = 0.05;

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

  /** Client-side: party slot this client controls (-1 = spectator). */
  static controlledSlot: number = -1;
  /** Client-side: the local mirror of the claimed party member. */
  static controlledCreature: ModuleCreature | undefined;
  static #moveIntent: { heading: number; run: boolean } | undefined;
  static #moveActive = false;
  static #lastMoveSentAt = 0;
  static #lastSentHeading = NaN;

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
    this.controlledSlot = -1;
    this.controlledCreature = undefined;
    this.#moveIntent = undefined;
    this.#moveActive = false;
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
      this.applyPeerMoveIntents();
      CoopHostReplicator.update(delta);
    }else if(this.isClient()){
      this.flushClientMoveIntent();
      CoopClientMirror.update(delta);
    }
  }

  /**
   * Client: register this frame's held-key steering (called from the input
   * processors each frame the key is held; world-space heading).
   */
  static clientMoveIntent(heading: number, run: boolean): void {
    if(!this.isClient() || this.controlledSlot < 0){ return; }
    this.#moveIntent = { heading, run };
  }

  /** Client: throttle + send MoveDir while held; MoveStop on release. */
  static flushClientMoveIntent(): void {
    const now = performance.now();
    if(this.#moveIntent){
      const headingChanged = Math.abs(this.#moveIntent.heading - this.#lastSentHeading) > MOVE_HEADING_EPSILON;
      if(!this.#moveActive || headingChanged || (now - this.#lastMoveSentAt) > MOVE_SEND_INTERVAL_MS){
        this.session?.sendToHost(
          new IPCMessage(IPCMessageType.Command, IPCMessageTypeCommand.MoveDir)
            .addFloat(this.#moveIntent.heading)
            .addInt(this.#moveIntent.run ? 1 : 0)
        );
        this.#lastMoveSentAt = now;
        this.#lastSentHeading = this.#moveIntent.heading;
        this.#moveActive = true;
      }
      this.#moveIntent = undefined;
    }else if(this.#moveActive){
      this.#moveActive = false;
      this.#lastSentHeading = NaN;
      this.session?.sendToHost(new IPCMessage(IPCMessageType.Command, IPCMessageTypeCommand.MoveStop));
    }
  }

  /** Client: claim a party member by index (1..2; slot 0 is the host's leader). */
  static claimSlot(slot: number): void {
    if(!this.isClient()){ return; }
    this.session?.sendToHost(
      new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.ClaimSlot).addInt(slot)
    );
  }

  /**
   * Host: apply fresh steering intents to owned creatures every sim frame
   * (the engine resets force/controlled per tick, so intents re-apply like
   * held keys do).
   */
  static applyPeerMoveIntents(): void {
    const now = performance.now();
    for(const peer of this.peers.values()){
      const creature = peer.controlledCreature;
      const intent = peer.moveIntent;
      if(!creature || !intent){ continue; }
      if((now - intent.receivedAt) > MOVE_INTENT_STALE_MS){
        peer.moveIntent = undefined;
        continue;
      }
      if(!creature.canMove()){ continue; }
      if(!intent.started){
        intent.started = true;
        creature.clearAllActions(true);
      }
      creature.force = 1;
      creature.setFacing(intent.heading, false, TURN_SPEED_FAST);
      creature.controlled = true;
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
          const peer = this.peers.get(ctrl.peerId);
          if(peer){ this.releaseSlot(peer); }
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
        this.handleCommandMessage(senderPeerId, msg);
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
      case IPCMessageTypeSession.ClaimSlot: {
        if(!this.isHost()){ break; }
        const slot = msg.intAt(0);
        const peer = this.peers.get(senderPeerId);
        const party = GameState.PartyManager.party;
        const creature = party[slot];
        if(!peer || !creature){ break; }
        if(slot == 0){
          console.warn(`NetworkManager: peer ${senderPeerId} tried to claim the leader slot — denied`);
          break;
        }
        if(creature.ownerPeerId >= 0 && creature.ownerPeerId != senderPeerId){
          console.warn(`NetworkManager: slot ${slot} already claimed by peer ${creature.ownerPeerId}`);
          break;
        }
        //Release any previous claim by this peer
        if(peer.controlledCreature && peer.controlledCreature != creature){
          this.releaseSlot(peer);
        }
        creature.ownerPeerId = senderPeerId;
        creature.clearAllActions(true);
        //Make sure the claimed member is standing on the walkmesh — an
        //off-mesh (room-less) creature cannot move at all.
        if(!creature.room){
          creature.getCurrentRoom();
          if(!creature.room){
            const leader = GameState.PartyManager.party[0];
            if(leader && leader != creature){
              creature.position.copy(leader.position);
              creature.getCurrentRoom();
            }
          }
        }
        peer.controlledCreature = creature;
        peer.controlledObjectId = creature.id;
        this.session?.broadcast(
          new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.SlotAssigned)
            .addInt(senderPeerId)
            .addObjectId(creature.id)
            .addInt(slot)
        );
        console.log(`NetworkManager: peer ${senderPeerId} claimed party slot ${slot} ('${creature.getName?.() ?? creature.tag}')`);
        this.processEventListener('slot-assigned', [senderPeerId, slot]);
        break;
      }
      case IPCMessageTypeSession.SlotAssigned: {
        if(!this.isClient()){ break; }
        const forPeerId = msg.intAt(0);
        const slot = msg.intAt(2);
        const creature = GameState.PartyManager.party[slot];
        if(creature){ creature.ownerPeerId = forPeerId; }
        if(forPeerId == this.peerId){
          this.controlledSlot = slot;
          this.controlledCreature = creature;
          console.log(`NetworkManager: we now control party slot ${slot} ('${creature?.getName?.() ?? creature?.tag}')`);
        }
        this.processEventListener('slot-assigned', [forPeerId, slot]);
        break;
      }
      case IPCMessageTypeSession.SlotReleased: {
        if(!this.isClient()){ break; }
        const forPeerId = msg.intAt(0);
        for(const member of GameState.PartyManager.party){
          if(member.ownerPeerId == forPeerId){ member.ownerPeerId = -1; }
        }
        if(forPeerId == this.peerId){
          this.controlledSlot = -1;
          this.controlledCreature = undefined;
        }
        this.processEventListener('slot-released', [forPeerId]);
        break;
      }
      case IPCMessageTypeSession.SetPause: {
        const paused = !!msg.intAt(0);
        if(this.isHost()){
          //A client requested pause/unpause: any player pausing pauses for
          //everyone (design §10). Route through the sanctioned API; the
          //replicator broadcasts the resulting state change.
          if(paused){
            GameState.AutoPauseManager.SignalAutoPauseEvent(AutoPauseState.Generic);
          }else{
            GameState.AutoPauseManager.Unpause();
          }
        }else{
          //Host state is authoritative.
          GameState.State = paused ? EngineState.PAUSED : EngineState.RUNNING;
        }
        break;
      }
      default:
        break;
    }
  }

  /** Client: ask the host to pause/unpause the shared session. */
  static requestPause(paused: boolean): void {
    if(!this.isClient()){ return; }
    this.session?.sendToHost(
      new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.SetPause).addInt(paused ? 1 : 0)
    );
  }

  /**
   * Client: a click-interaction with a world object — route the intent to the
   * host as a Command for our claimed member. Conversations are blocked
   * client-side ('only the party leader can speak to them').
   */
  static clientInteract(obj: any): void {
    if(!this.isClient() || !this.controlledCreature){ return; }
    const hostId = CoopClientMirror.hostIdFor(obj);
    if(hostId < 0){ return; }

    const isDoor = typeof obj.setOpenState === 'function' && typeof obj.openDoor === 'function';
    const isCreature = !!obj.combatData;
    if(isCreature){
      if(!obj.isDead() && obj.isHostile(this.controlledCreature)){
        this.session?.sendToHost(
          new IPCMessage(IPCMessageType.Command, IPCMessageTypeCommand.Attack).addObjectId(hostId)
        );
        return;
      }
      if(obj.isDead()){
        this.session?.sendToHost(
          new IPCMessage(IPCMessageType.Command, IPCMessageTypeCommand.UseObject).addObjectId(hostId)
        );
        return;
      }
      //Friendly creature: conversations are host-only (design §7).
      this.processEventListener('dialog-blocked', [obj]);
      console.log('NetworkManager: conversations are host-only — blocked');
      return;
    }
    if(isDoor || obj){
      this.session?.sendToHost(
        new IPCMessage(IPCMessageType.Command, IPCMessageTypeCommand.UseObject).addObjectId(hostId)
      );
    }
  }

  /** Host: validated client→host intent for the peer's claimed creature. */
  static handleCommandMessage(senderPeerId: number, msg: IPCMessage): void {
    if(!this.isHost()){ return; }
    const peer = this.peers.get(senderPeerId);
    const creature = peer?.controlledCreature;
    if(!peer || !creature || creature.ownerPeerId != senderPeerId){ return; }

    switch(msg.subType){
      case IPCMessageTypeCommand.MoveDir: {
        const started = peer.moveIntent?.started ?? false;
        peer.moveIntent = {
          heading: msg.floatAt(0),
          run: !!msg.intAt(1),
          receivedAt: performance.now(),
          started,
        };
        break;
      }
      case IPCMessageTypeCommand.MoveStop: {
        peer.moveIntent = undefined;
        break;
      }
      case IPCMessageTypeCommand.Attack: {
        const target = GameState.ModuleObjectManager.GetObjectById(msg.objectIdAt(0));
        if(target && !target.isDead?.()){
          peer.moveIntent = undefined;
          creature.clearAllActions(true);
          creature.attackCreature(target as any);
        }
        break;
      }
      case IPCMessageTypeCommand.UseObject: {
        const target: any = GameState.ModuleObjectManager.GetObjectById(msg.objectIdAt(0));
        if(!target){ break; }
        peer.moveIntent = undefined;
        creature.clearAllActions(true);
        if(typeof target.setOpenState === 'function' && typeof target.openDoor === 'function'){
          creature.actionOpenDoor(target);
        }else{
          creature.actionUseObject(target);
        }
        break;
      }
      case IPCMessageTypeCommand.ClearActions: {
        peer.moveIntent = undefined;
        creature.clearAllActions(true);
        break;
      }
    }
  }

  /** Host: release a peer's claimed creature back to companion AI. */
  static releaseSlot(peer: ICoopPeer): void {
    const creature = peer.controlledCreature;
    if(creature){
      creature.ownerPeerId = -1;
      creature.clearAllActions(true);
      this.session?.broadcast(
        new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.SlotReleased).addInt(peer.peerId)
      );
      console.log(`NetworkManager: released party member '${creature.getName?.() ?? creature.tag}' from peer ${peer.peerId}`);
    }
    peer.controlledCreature = undefined;
    peer.controlledObjectId = -1;
    peer.moveIntent = undefined;
  }
}
