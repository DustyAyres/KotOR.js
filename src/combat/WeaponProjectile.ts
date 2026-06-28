import * as THREE from "three";
import { GameState } from "@/GameState";
import type { ModuleObject } from "@/module/ModuleObject";
import type { ModuleItem } from "@/module/ModuleItem";

/**
 * WeaponProjectile class.
 *
 * A cosmetic ranged-weapon projectile (blaster bolt, etc.): plays the weapon's
 * shot sound, draws a muzzle flash + a travelling bolt streak from the gun's muzzle
 * to the target, and plays the impact sound on arrival. Purely visual/audible — the
 * hit/damage for the round is resolved separately by {@link CombatRound}.
 *
 * Note on the bolt visual: the original Odyssey bolt model from ammunitiontypes.2da
 * (e.g. `w_laserfire_r`) is NOT a mesh — it's an Explosion-type OdysseyEmitter + a
 * light, which only emits on detonate() and renders nothing under a normal travelling
 * update (verified at runtime: meshCount 0, the emitter never spawns particles while
 * ticked). Rather than drive that emitter, we draw a simple bright unlit streak
 * (MeshBasicMaterial, so it's always visible regardless of scene lighting/fog),
 * coloured per ammunition type. This reliably shows blaster fire; the exact vanilla
 * particle look is a future enhancement if the emitter path is ever wired up.
 *
 * Live bolts live in {@link WeaponProjectile.active}, advanced each frame by
 * {@link WeaponProjectile.updateAll} (from Module.tick) and cleared on Module.dispose
 * via {@link WeaponProjectile.disposeAll}.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file WeaponProjectile.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class WeaponProjectile {

  /** All bolts currently in flight; ticked by Module.tick, cleared on Module.dispose. */
  static active: WeaponProjectile[] = [];

  /** Bolt colour per ammunitiontypes.2da row index (blaster/ion/disruptor/sonic…). */
  static AMMO_COLORS: { [k: number]: number } = {
    1: 0xff5a2a, // Blaster  — orange-red
    2: 0x4aa0ff, // Ion      — blue
    3: 0xe6ff7a, // Disruptor— yellow-green
    4: 0xc060ff, // Sonic    — violet
    5: 0xff3030, // (other)  — red
  };
  static DEFAULT_COLOR = 0xff5a2a;

  attacker: ModuleObject;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  color: number;
  impactSound: string;

  mesh: THREE.Mesh;
  speed: number = 45;        // metres / second — fast, but the streak stays readable
  travelTime: number = 0.15; // seconds (recomputed from distance)
  elapsed: number = 0;
  completed: boolean = false;
  disposed: boolean = false;

  constructor(opts: {
    attacker: ModuleObject,
    origin: THREE.Vector3,
    target: THREE.Vector3,
    color?: number,
    impactSound?: string,
  }){
    this.attacker = opts.attacker;
    this.origin = opts.origin.clone();
    this.target = opts.target.clone();
    this.color = (opts.color != null) ? opts.color : WeaponProjectile.DEFAULT_COLOR;
    this.impactSound = WeaponProjectile.cleanResRef(opts.impactSound);

    const distance = this.origin.distanceTo(this.target);
    // Min 0.16s so a point-blank shot survives several render frames (otherwise it
    // can be created and disposed within one frame and never be seen).
    this.travelTime = Math.min(Math.max(distance / this.speed, 0.16), 0.45);
  }

  buildMesh(){
    // A thin, long, unlit streak oriented along the muzzle->target line.
    const geometry = new THREE.BoxGeometry(0.11, 0.11, 0.8);
    const material = new THREE.MeshBasicMaterial({
      color: this.color, fog: false, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(this.origin);
    try { mesh.lookAt(this.target); } catch(e){}
    mesh.renderOrder = 999;
    this.mesh = mesh;
    GameState.group.effects.add(mesh);
  }

  update(delta: number = 0){
    if(this.completed) return;
    this.elapsed += delta;
    const t = this.travelTime > 0 ? Math.min(this.elapsed / this.travelTime, 1) : 1;
    if(this.mesh){ this.mesh.position.lerpVectors(this.origin, this.target, t); }
    if(t >= 1) this.impact();
  }

  impact(){
    if(this.completed) return;
    this.completed = true;
    if(this.impactSound){
      try { GameState.guiAudioEmitter?.playSoundFireAndForget(this.impactSound); } catch(e){}
    }
    this.dispose();
  }

  dispose(){
    this.disposed = true;
    if(this.mesh){
      try {
        this.mesh.removeFromParent();
        this.mesh.geometry?.dispose();
        (this.mesh.material as THREE.Material)?.dispose?.();
      } catch(e){}
      this.mesh = undefined;
    }
    const i = WeaponProjectile.active.indexOf(this);
    if(i >= 0) WeaponProjectile.active.splice(i, 1);
  }

  /** Strip trailing nulls/whitespace; treat '' and '****' (2DA empty) as no resref. */
  static cleanResRef(value: any): string {
    if(typeof value !== 'string') return '';
    value = value.replace(/\0[\s\S]*$/g, '').trim();
    if(value === '' || value === '****') return '';
    return value.toLowerCase();
  }

  /** Randomly pick one of the two 2DA sound variants (either may be empty). */
  static pickSound(a: any, b: any): string {
    const s0 = WeaponProjectile.cleanResRef(a);
    const s1 = WeaponProjectile.cleanResRef(b);
    if(s0 && s1) return Math.random() < 0.5 ? s0 : s1;
    return s0 || s1;
  }

  /**
   * Fire a bolt for a ranged-weapon attack. Looks up the weapon's
   * `ammunitiontypes.2da` row, plays the shot sound, draws the muzzle flash, and
   * launches the travelling bolt. No-op for weapons without an ammunition type
   * (melee weapons), so callers can invoke it unconditionally.
   */
  static fireFromWeapon(weapon: ModuleItem, attacker: ModuleObject, target: ModuleObject){
    if(!weapon || !attacker || !target) return;

    const baseItem: any = (weapon as any).baseItem;
    const ammunitionType: number = baseItem ? baseItem.ammunitionType : -1;
    if(!(ammunitionType >= 1)) return; // -1/0 == no ammunition (melee, unarmed)

    const _2DA = GameState.TwoDAManager.datatables.get('ammunitiontypes');
    const rows: any = _2DA ? (Array.isArray(_2DA.rows) ? _2DA.rows : Object.values(_2DA.rows)) : [];
    const ammo: any = rows[ammunitionType] || {};

    // --- Muzzle origin -------------------------------------------------------
    // Prefer the weapon model's muzzle node (animates with the gun); fall back to
    // the attacker's right hand, then to a point in front of the attacker.
    const origin = new THREE.Vector3();
    let muzzle: any;
    const weaponModel: any = (weapon as any).model;
    if(weaponModel && typeof weaponModel.getObjectByName === 'function'){
      muzzle = weaponModel.getObjectByName('bullethook0') || weaponModel.getObjectByName('gunhook0');
    }
    const attackerModel: any = (attacker as any).model;
    if(muzzle && typeof muzzle.getWorldPosition === 'function'){
      muzzle.getWorldPosition(origin);
    } else if(attackerModel?.rhand && typeof attackerModel.rhand.getWorldPosition === 'function'){
      attackerModel.rhand.getWorldPosition(origin);
    } else {
      origin.copy(attacker.position);
      origin.z += 1.5;
    }

    // --- Target point (centre mass) -----------------------------------------
    const targetPoint = target.position.clone();
    targetPoint.z += 1.0;

    const color = WeaponProjectile.AMMO_COLORS[ammunitionType] || WeaponProjectile.DEFAULT_COLOR;

    // --- Shot sound (fire-and-forget, same path the swoop gun-bank uses) -----
    const shot = WeaponProjectile.pickSound(ammo.shotsound0, ammo.shotsound1);
    if(shot){ try { GameState.guiAudioEmitter?.playSoundFireAndForget(shot); } catch(e){} }

    // --- Muzzle flash (brief bright blip at the muzzle) ----------------------
    WeaponProjectile.spawnMuzzleFlash(origin, color);

    // --- Travelling bolt -----------------------------------------------------
    const projectile = new WeaponProjectile({
      attacker, origin, target: targetPoint, color,
      impactSound: WeaponProjectile.pickSound(ammo.impactsound0, ammo.impactsound1),
    });
    projectile.buildMesh();
    WeaponProjectile.active.push(projectile);
    return projectile;
  }

  /** A short-lived bright blip at the muzzle when a shot is fired. */
  static spawnMuzzleFlash(origin: THREE.Vector3, color: number){
    try {
      const geometry = new THREE.SphereGeometry(0.12, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.85, depthWrite: false });
      const flash = new THREE.Mesh(geometry, material);
      flash.position.copy(origin);
      flash.renderOrder = 999;
      GameState.group.effects.add(flash);
      setTimeout(() => {
        try { flash.removeFromParent(); flash.geometry.dispose(); (flash.material as THREE.Material).dispose(); } catch(e){}
      }, 90);
    } catch(e){ /* best-effort */ }
  }

  static updateAll(delta: number = 0){
    for(let i = WeaponProjectile.active.length - 1; i >= 0; i--){
      const p = WeaponProjectile.active[i];
      if(p){ p.update(delta); } else { WeaponProjectile.active.splice(i, 1); }
    }
  }

  static disposeAll(){
    while(WeaponProjectile.active.length){
      const p = WeaponProjectile.active[0];
      if(p){ p.dispose(); } else { WeaponProjectile.active.shift(); }
    }
  }

}
