import { GameState } from "@/GameState";
import { EngineState } from "@/enums/engine/EngineState";
import { IPCMessageType } from "@/enums/server/ipc/IPCMessageType";
import { IPCMessageTypeSession } from "@/enums/server/ipc/IPCMessageTypeSession";
import { IPCMessageTypeObject } from "@/enums/server/ipc/IPCMessageTypeObject";
import { IPCMessageTypeModule } from "@/enums/server/ipc/IPCMessageTypeModule";
import { IPCMessage } from "@/server/ipc/IPCMessage";
import type { ModuleObject, ModuleCreature, ModuleDoor } from "@/module";

/**
 * CoopHostReplicator — host-side world replication.
 *
 * On peer-ready: streams the party (slot + npcId + live GFF template) and a
 * Module.Load directive, then (once the client reports ClientReady) an
 * Object.Create binding burst. Every tick (10Hz) it polls watched objects and
 * broadcasts Transform / Animation / door State / Death deltas.
 *
 * Object identity: the wire key is the HOST's ModuleObject.id. World objects
 * bind on the client by id (fresh-load determinism) with tag as a fallback;
 * party members bind by slot.
 */

interface IReplicatedObjectState {
  x: number; y: number; z: number; facing: number;
  animKey: string;
  dead: boolean;
  openState: number;
  hp: number;
  combatState: boolean;
}

/** Object.State field ids (Object.State: objectId, field, value). */
export enum CoopObjectStateField {
  DoorOpenState = 0,
  CombatState = 1,
}

const TICK_INTERVAL_MS = 100;
const POS_EPSILON = 0.005;
const FACING_EPSILON = 0.01;

export class CoopHostReplicator {

  static lastSent: Map<number, IReplicatedObjectState> = new Map();
  static #tickTimer = 0;
  /** Number of peers currently mirroring (replication only runs when > 0). */
  static #replicatingPeers: Set<number> = new Set();
  static #lastPaused: boolean = false;

  static reset(){
    this.lastSent.clear();
    this.#replicatingPeers.clear();
    this.#tickTimer = 0;
    this.#lastPaused = false;
  }

  static get active(): boolean {
    return this.#replicatingPeers.size > 0;
  }

  /**
   * A peer completed the Session handshake: send it the party composition
   * (live templates) + the module to load.
   */
  static onPeerReady(peerId: number){
    const nm = GameState.NetworkManager;
    const pm = GameState.PartyManager;
    if(!nm?.session || !GameState.module){ return; }

    const party = pm.party;
    for(let i = 0; i < party.length; i++){
      const member = party[i];
      try{
        const template = member.save();
        const buffer = template.getExportBuffer();
        nm.session.send(peerId,
          new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.PartyMember)
            .addInt(i)
            .addInt(member.npcId ?? -1)
            .addInt(i == 0 ? 1 : 0)
            .addVoidBytes(buffer)
        );
      }catch(e){
        console.error(`CoopHostReplicator: failed to serialize party member ${i}`, e);
      }
    }

    nm.session.send(peerId,
      new IPCMessage(IPCMessageType.Module, IPCMessageTypeModule.Load)
        .addString(GameState.module.filename ?? '')
        .addString('')
    );
    console.log(`CoopHostReplicator: sent party (${party.length}) + Module.Load to peer ${peerId}`);
  }

  /**
   * The peer loaded the module: send the Object.Create binding burst and
   * begin delta replication.
   */
  static onClientReady(peerId: number){
    const nm = GameState.NetworkManager;
    if(!nm?.session){ return; }

    for(const obj of this.watchedObjects()){
      const partySlot = GameState.PartyManager.party.indexOf(obj as ModuleCreature);
      nm.session.send(peerId,
        new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.Create)
          .addObjectId(obj.id)
          .addInt(this.objectCategory(obj))
          .addInt(partySlot)
          .addString(obj.tag ?? '')
          .addFloat(obj.position.x).addFloat(obj.position.y).addFloat(obj.position.z)
          .addFloat(obj.rotation.z)
      );
    }

    this.#replicatingPeers.add(peerId);
    //Force a full state push on the next tick so the new client snaps current.
    this.lastSent.clear();
    //Sync the pause state to the new client.
    const paused = GameState.State == EngineState.PAUSED;
    nm.session.send(peerId,
      new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.SetPause).addInt(paused ? 1 : 0)
    );
    console.log(`CoopHostReplicator: peer ${peerId} mirroring — replication started`);
  }

  /**
   * Emitted from the CombatRound results loop: one attack resolved. Clients
   * reproduce the cosmetics that HP/anim replication cannot (floaty damage/
   * miss text, blaster bolts, impact SFX).
   */
  static onCombatAttack(attacker: ModuleObject, target: ModuleObject, result: number, damage: number, weaponSlot: number){
    if(!this.active){ return; }
    const nm = GameState.NetworkManager;
    if(!nm?.session){ return; }
    nm.session.broadcast(
      new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.CombatEvent)
        .addObjectId(attacker.id)
        .addObjectId(target.id)
        .addInt(result)
        .addInt(damage)
        .addInt(weaponSlot)
    );
  }

  static onPeerLeft(peerId: number){
    this.#replicatingPeers.delete(peerId);
  }

  /** 1 = creature, 2 = door, 3 = placeable */
  static objectCategory(obj: any): number {
    const area = GameState.module?.area;
    if(area?.doors.indexOf(obj) >= 0){ return 2; }
    if(area?.placeables.indexOf(obj) >= 0){ return 3; }
    return 1;
  }

  static *watchedObjects(): Generator<ModuleObject> {
    const area = GameState.module?.area;
    if(!area){ return; }
    for(const member of GameState.PartyManager.party){ yield member; }
    for(const creature of area.creatures){ yield creature; }
    for(const door of area.doors){ yield door; }
  }

  /** Per-frame pump (called from NetworkManager.update on the host). */
  static update(delta: number){
    if(!this.active){ return; }
    this.#tickTimer += delta * 1000;
    if(this.#tickTimer < TICK_INTERVAL_MS){ return; }
    this.#tickTimer = 0;

    const nm = GameState.NetworkManager;
    if(!nm?.session){ return; }

    //Synchronized pause: host EngineState is authoritative and replicates.
    const paused = GameState.State == EngineState.PAUSED;
    if(paused != this.#lastPaused){
      this.#lastPaused = paused;
      nm.session.broadcast(
        new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.SetPause).addInt(paused ? 1 : 0)
      );
    }

    for(const obj of this.watchedObjects()){
      let last = this.lastSent.get(obj.id);
      if(!last){
        last = { x: NaN, y: NaN, z: NaN, facing: NaN, animKey: '', dead: false, openState: -1, hp: NaN, combatState: false };
        this.lastSent.set(obj.id, last);
      }

      //Transform delta
      const p = obj.position;
      const facing = obj.rotation.z;
      if(
        Math.abs(p.x - last.x) > POS_EPSILON || Math.abs(p.y - last.y) > POS_EPSILON ||
        Math.abs(p.z - last.z) > POS_EPSILON || Math.abs(facing - last.facing) > FACING_EPSILON ||
        Number.isNaN(last.x)
      ){
        last.x = p.x; last.y = p.y; last.z = p.z; last.facing = facing;
        nm.session.broadcast(
          new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.Transform)
            .addObjectId(obj.id)
            .addFloat(p.x).addFloat(p.y).addFloat(p.z)
            .addFloat(facing)
        );
      }

      //Creature-only deltas
      const creature = obj as ModuleCreature;
      if(creature.animationState !== undefined){
        const anim = creature.animationState;
        const animKey = `${anim.index}:${anim.animation?.name ?? ''}`;
        if(animKey != last.animKey){
          last.animKey = animKey;
          nm.session.broadcast(
            new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.Animation)
              .addObjectId(obj.id)
              .addInt(anim.index)
              .addString(anim.animation?.name ?? '')
          );
        }

        const dead = creature.isDead ? creature.isDead() : false;
        if(dead != last.dead){
          last.dead = dead;
          if(dead){
            nm.session.broadcast(
              new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.Death)
                .addObjectId(obj.id)
            );
          }
        }

        const hp = creature.getHP();
        if(hp != last.hp){
          last.hp = hp;
          nm.session.broadcast(
            new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.HP)
              .addObjectId(obj.id)
              .addInt(hp)
              .addInt(creature.getMaxHP())
          );
        }

        const combatState = !!creature.combatData?.combatState;
        if(combatState != last.combatState){
          last.combatState = combatState;
          nm.session.broadcast(
            new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.State)
              .addObjectId(obj.id)
              .addInt(CoopObjectStateField.CombatState)
              .addInt(combatState ? 1 : 0)
          );
        }
      }

      //Door-only deltas
      const door = obj as ModuleDoor;
      if(door.openState !== undefined && door.openState != last.openState){
        last.openState = door.openState;
        nm.session.broadcast(
          new IPCMessage(IPCMessageType.Object, IPCMessageTypeObject.State)
            .addObjectId(obj.id)
            .addInt(0)
            .addInt(door.openState)
        );
      }
    }
  }
}
