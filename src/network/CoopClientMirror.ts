import * as THREE from "three";
import { GameState } from "@/GameState";
import { IPCMessageTypeSession } from "@/enums/server/ipc/IPCMessageTypeSession";
import { IPCMessageTypeObject } from "@/enums/server/ipc/IPCMessageTypeObject";
import { IPCMessageTypeModule } from "@/enums/server/ipc/IPCMessageTypeModule";
import { IPCMessageType } from "@/enums/server/ipc/IPCMessageType";
import { IPCMessage } from "@/server/ipc/IPCMessage";
import { GFFObject } from "@/resource/GFFObject";
import { CurrentGame } from "@/engine/CurrentGame";
import { OdysseyModelAnimation } from "@/odyssey";
import { AttackResult } from "@/enums/combat/AttackResult";
import { TextSprite3DType } from "@/enums/engine/TextSprite3DType";
import { TextSprite3D } from "@/engine/TextSprite3D";
import { WeaponProjectile } from "@/combat/WeaponProjectile";
import { CoopObjectStateField } from "@/network/CoopHostReplicator";
import type { ModuleObject, ModuleCreature, ModuleDoor } from "@/module";

/**
 * CoopClientMirror — client-side world mirror.
 *
 * Receives the host's party templates + Module.Load, loads the module locally
 * (scripts/actions are dead client-side via the NetMode.CLIENT gates), binds
 * host object ids to local objects (party by slot, world objects by id with
 * tag verification), then applies replicated Transform/Animation/State/Death
 * deltas with position interpolation.
 */

interface IPendingPartyMember {
  slot: number;
  npcId: number;
  isLeader: boolean;
  template: Uint8Array;
}

interface ITransformTarget {
  position: THREE.Vector3;
  facing: number;
}

/** Positions further off than this snap instead of lerping. */
const SNAP_DISTANCE = 8;
const LERP_RATE = 12;

export class CoopClientMirror {

  /** host object id -> local object */
  static objects: Map<number, ModuleObject> = new Map();
  /** local object -> host object id (for outgoing Commands) */
  static hostIds: Map<ModuleObject, number> = new Map();
  static targets: Map<number, ITransformTarget> = new Map();
  static partyMembers: IPendingPartyMember[] = [];
  static loading = false;
  static ready = false;

  static reset(){
    this.objects.clear();
    this.hostIds.clear();
    this.targets.clear();
    this.partyMembers = [];
    this.loading = false;
    this.ready = false;
  }

  /** Resolve the host-side id for a local mirrored object (-1 if unbound). */
  static hostIdFor(obj: ModuleObject): number {
    return this.hostIds.get(obj) ?? -1;
  }

  /** Message switchboard for host->client world replication. */
  static handleMessage(msg: IPCMessage){
    switch(msg.type){
      case IPCMessageType.Session:
        if(msg.subType == IPCMessageTypeSession.PartyMember){
          this.partyMembers.push({
            slot: msg.intAt(0),
            npcId: msg.intAt(1),
            isLeader: !!msg.intAt(2),
            template: msg.getParam(3)?.getVoid() ?? new Uint8Array(0),
          });
          console.log(`CoopClientMirror: received party member slot ${msg.intAt(0)} (npcId ${msg.intAt(1)})`);
        }
        break;
      case IPCMessageType.Module:
        if(msg.subType == IPCMessageTypeModule.Load){
          this.loadHostModule(msg.stringAt(0), msg.stringAt(1));
        }
        break;
      case IPCMessageType.Object:
        this.handleObjectMessage(msg);
        break;
    }
  }

  /**
   * Provision the host's party locally (templates carry appearance/equipment)
   * and load the host's module through the normal pipeline — the NetMode
   * gates keep scripts/actions/AI from running.
   */
  static async loadHostModule(resref: string, waypoint: string){
    if(this.loading || !resref){ return; }
    this.loading = true;
    console.log(`CoopClientMirror: loading host module '${resref}'...`);
    try{
      const pm = GameState.PartyManager;

      //Party templates: PC (npcId -1) becomes the local player template;
      //companions register as roster members so loadParty spawns them.
      this.partyMembers.sort((a, b) => a.slot - b.slot);
      for(const member of this.partyMembers){
        const template = new GFFObject(member.template);
        if(member.npcId < 0){
          pm.PlayerTemplate = template;
          pm.ActualPlayerTemplate = template;
          try{
            const ModulePlayerClass: any = (GameState.Module as any)?.ModuleArea?.ModulePlayer;
            if(ModulePlayerClass){
              const pc = new ModulePlayerClass(template);
              pc.load();
              pm.AddPortraitToOrder(pc.getPortraitResRef());
            }
          }catch(e){ console.warn('CoopClientMirror: portrait setup skipped', e); }
        }else{
          if(pm.NPCS[member.npcId]){
            pm.NPCS[member.npcId].available = true;
            pm.NPCS[member.npcId].canSelect = true;
            pm.NPCS[member.npcId].template = template;
          }
          pm.CurrentMembers.push({ isLeader: member.isLeader, memberID: member.npcId });
        }
      }

      GameState.GlobalVariableManager.Init();
      await CurrentGame.InitGameInProgressFolder(true);
      await GameState.LoadModule(resref, waypoint || undefined as any);

      //LoadModule resolves before the area finishes initializing; replication
      //binding needs the world fully built.
      await this.waitUntilModuleReady();

      this.ready = true;
      GameState.NetworkManager?.session?.sendToHost(
        new IPCMessage(IPCMessageType.Session, IPCMessageTypeSession.ClientReady)
      );
      console.log(`CoopClientMirror: module '${resref}' mirrored — sent ClientReady`);
    }catch(e){
      console.error(`CoopClientMirror: failed to load host module '${resref}'`, e);
    }finally{
      this.loading = false;
    }
  }

  static waitUntilModuleReady(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if(GameState.module?.readyToProcessEvents){
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  static handleObjectMessage(msg: IPCMessage){
    switch(msg.subType){
      case IPCMessageTypeObject.Create: {
        const hostId = msg.objectIdAt(0);
        //param 1 = category (currently informational; binding uses slot/id/tag)
        const partySlot = msg.intAt(2);
        const tag = msg.stringAt(3);
        const x = msg.floatAt(4), y = msg.floatAt(5), z = msg.floatAt(6);
        const facing = msg.floatAt(7);
        const obj = this.bindObject(hostId, partySlot, tag);
        if(obj){
          obj.position.set(x, y, z);
          obj.rotation.z = facing;
        }
        break;
      }
      case IPCMessageTypeObject.Transform: {
        const obj = this.objects.get(msg.objectIdAt(0));
        if(!obj){ break; }
        const x = msg.floatAt(1), y = msg.floatAt(2), z = msg.floatAt(3);
        const facing = msg.floatAt(4);
        let target = this.targets.get(obj.id);
        if(!target){
          target = { position: new THREE.Vector3(), facing: 0 };
          this.targets.set(obj.id, target);
        }
        target.position.set(x, y, z);
        target.facing = facing;
        if(obj.position.distanceTo(target.position) > SNAP_DISTANCE){
          obj.position.copy(target.position);
          obj.setFacing(facing, true);
        }else{
          obj.setFacing(facing, false);
        }
        break;
      }
      case IPCMessageTypeObject.Animation: {
        const creature = this.objects.get(msg.objectIdAt(0)) as ModuleCreature;
        if(!creature || creature.animationState === undefined){ break; }
        this.applyAnimation(creature, msg.intAt(1), msg.stringAt(2));
        break;
      }
      case IPCMessageTypeObject.State: {
        const obj: any = this.objects.get(msg.objectIdAt(0));
        if(!obj){ break; }
        const field = msg.intAt(1);
        const value = msg.intAt(2);
        if(field == CoopObjectStateField.DoorOpenState && typeof obj.setOpenState === 'function' && obj.openState != value){
          obj.setOpenState(value);
        }else if(field == CoopObjectStateField.CombatState && obj.combatData){
          obj.combatData.combatState = !!value;
          if(typeof obj.weaponPowered === 'function'){
            obj.weaponPowered(!!value);
          }
        }
        break;
      }
      case IPCMessageTypeObject.HP: {
        const obj = this.objects.get(msg.objectIdAt(0));
        if(!obj){ break; }
        obj.currentHP = msg.intAt(1);
        break;
      }
      case IPCMessageTypeObject.CombatEvent: {
        const attacker = this.objects.get(msg.objectIdAt(0)) as ModuleCreature;
        const target = this.objects.get(msg.objectIdAt(1));
        if(!attacker || !target){ break; }
        const result = msg.intAt(2);
        const damage = msg.intAt(3);
        const weaponSlot = msg.intAt(4);
        if(
          result == AttackResult.HIT_SUCCESSFUL ||
          result == AttackResult.CRITICAL_HIT ||
          result == AttackResult.AUTOMATIC_HIT
        ){
          TextSprite3D.CreateOnObject(target, damage.toString(), TextSprite3DType.HOSTILE, 1500);
        }else if(result == AttackResult.MISS){
          TextSprite3D.CreateOnObject(target, 'miss', TextSprite3DType.NEUTRAL, 1500);
        }
        //Blaster bolts/muzzle flash/shot SFX (no-op for melee weapons)
        const weapon = weaponSlot == 2 ? attacker.equipment?.LEFTHAND : attacker.equipment?.RIGHTHAND;
        if(weapon){
          try{
            WeaponProjectile.fireFromWeapon(weapon, attacker, target);
          }catch(e){
            console.warn('CoopClientMirror: bolt VFX failed', e);
          }
        }
        break;
      }
      case IPCMessageTypeObject.Death: {
        const creature = this.objects.get(msg.objectIdAt(0)) as ModuleCreature;
        if(!creature){ break; }
        creature.setHP(0);
        (creature as any).deathStarted = true;
        break;
      }
    }
  }

  /**
   * Bind a host object id to a local object: party members by slot; world
   * objects by matching local id (fresh-load id determinism) verified by tag,
   * falling back to a tag search.
   */
  static bindObject(hostId: number, partySlot: number, tag: string): ModuleObject | undefined {
    const existing = this.objects.get(hostId);
    if(existing){ return existing; }

    let obj: ModuleObject | undefined;
    if(partySlot >= 0){
      obj = GameState.PartyManager.party[partySlot];
    }else{
      const byId = GameState.ModuleObjectManager.GetObjectById(hostId);
      if(byId && (byId.tag ?? '') == tag){
        obj = byId;
      }else{
        const area = GameState.module?.area;
        const bound = new Set(this.objects.values());
        obj = [...(area?.creatures ?? []), ...(area?.doors ?? []), ...(area?.placeables ?? [])]
          .find(o => !bound.has(o) && (o.tag ?? '') == tag);
      }
    }

    if(obj){
      this.objects.set(hostId, obj);
      this.hostIds.set(obj, hostId);
    }else{
      console.warn(`CoopClientMirror: could not bind host object ${hostId} (tag '${tag}', slot ${partySlot})`);
    }
    return obj;
  }

  static applyAnimation(creature: ModuleCreature, index: number, name: string){
    creature.setAnimationState(index);
    const resolved = creature.animationState?.animation?.name ?? '';
    if(name && resolved.toLowerCase() != name.toLowerCase()){
      const anim = OdysseyModelAnimation.GetAnimation2DA(name);
      if(anim){
        creature.animationState.animation = anim;
        creature.animationState.started = false;
      }
    }
  }

  /** Per-frame interpolation toward replicated transforms (client pump). */
  static update(delta: number){
    if(!this.ready){ return; }
    const alpha = Math.min(1, delta * LERP_RATE);
    for(const [hostId, target] of this.targets){
      const obj = this.objects.get(hostId);
      if(!obj){ continue; }
      obj.position.lerp(target.position, alpha);
      if(obj.position.distanceToSquared(target.position) < 0.0001){
        obj.position.copy(target.position);
        this.targets.delete(hostId);
      }
    }
  }
}
