import { GameEffect } from "@/effects/GameEffect";
import { GameState } from "@/GameState";
import { GameEffectDurationType } from "@/enums/effects/GameEffectDurationType";
import { GameEffectType } from "@/enums/effects/GameEffectType";
import { MDLLoader, TextureLoader } from "@/loaders";
// import { TwoDAManager } from "@/managers/TwoDAManager";
import { OdysseyModel } from "@/odyssey";
import { OdysseyModel3D } from "@/three/odyssey";
import * as THREE from "three";

/**
 * EffectBeam class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file EffectBeam.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectBeam extends GameEffect {
  modelName: string;
  model: OdysseyModel3D;
  visualEffect: any;
  attached: boolean = false;
  removed: boolean = false;
  targetTracker: THREE.Object3D;

  constructor(){
    super();
    this.type = GameEffectType.EffectBeam;

    //intList[0] : visualeffects.2da id
    //intList[1] : bodypart constant
    //intList[2] : hit or miss

    //objectList[0] : caster

    // this.modelName = undefined;
    // this.model = undefined;

  }

  initialize() {
    if(this.initialized)
      return this;
      
    const visualeffects2DA = GameState.TwoDAManager.datatables.get('visualeffects');
    if(visualeffects2DA){
      this.visualEffect = visualeffects2DA.getByID(this.getInt(0));
    }

    super.initialize();

    if(!this.visualEffect){
      // Guard: an unguarded `this.visualEffect.progfx_duration` below would THROW here when
      // the lookup misses, killing the whole impactscript's beam silently. Bail cleanly.
      console.warn('EffectBeam: no visualeffects.2da row for id', this.getInt(0));
      this.modelName = '';
      return this;
    }

    // progfx_duration comes from the 2DA as a STRING ("619"), but the cases below are numbers.
    // A bare `switch(string)` never matches a numeric case (strict ===), so EVERY beam fell
    // through to the v_coldray_dur default — the real reason force-power beams showed the wrong
    // (or no) model. Coerce to a number.
    switch(Number(this.visualEffect.progfx_duration)){
      case 616:
        this.modelName = 'v_coldray_dur';
      break;
      case 612: 
        this.modelName = 'v_deathfld_dur';
      break;
      case 613: 
        this.modelName = 'v_drain_dur';
      break;
      case 611:
        this.modelName = 'v_drdkill_dur';
      break;
      case 610:
        this.modelName = 'v_drddisab_dur';
      break;
      case 620: 
        this.modelName = 'v_drdstun_dur';
      break;
      case 614:
        this.modelName = 'v_flame_dur';
      break;
      case 619:
        this.modelName = 'v_fstorm_dur';
      break;
      case 617:
        this.modelName = 'v_ionray01_dur';
      break;
      case 618:
        this.modelName = 'v_ionray02_dur';
      break;
      case 609:
        this.modelName = 'v_lightnx_dur';
      break;
      case 608:
        this.modelName = 'v_lightns_dur';
      break;
      case 621:
        this.modelName = 'v_fshock_dur';
      break;
      case 615:
        this.modelName = 'v_stunray_dur';
      break;
      default:
        this.modelName = 'v_coldray_dur';
      break;
    }
    return this;
  }

  loadModel(): Promise<void> {
    return new Promise<void>( ( resolve ) => {
      if(!this.modelName){ resolve(); return; }
      MDLLoader.loader.load(this.modelName)
      .then((mdl: OdysseyModel) => {
        OdysseyModel3D.FromMDL(mdl, {
          context: this.object.context,
          onComplete: async (model: OdysseyModel3D) => {
            this.model = model;
            // Bind the particle texture DETERMINISTICALLY before the beam attaches/renders.
            // OdysseyEmitter3D only ENQUEUES its texture onto the SHARED global TextureLoader.queue
            // (enQueueParticle). GameState's per-frame loop also drains that same queue and
            // LoadQueue() slices+empties it atomically — so a plain LoadQueue() here frequently finds
            // an already-drained queue and no-ops, leaving uniforms.map null. With map unbound the
            // LIGHTNING fragment shader multiplies colorMixed by texture2D(null)≈0, so the bolt is a
            // featureless additive blob. Awaiting Load() and assigning uniforms.map directly removes
            // that race so the texture is bound BEFORE attachBeam() sets attached=true.
            await this.bindEmitterTextures();
            // ModuleObject.addEffect calls loadModel() then onApply() on the SAME tick, so onApply ran
            // before this async load finished and its `this.model` guard failed (the beam never
            // attached). Attach here, once the mesh + texture are ready.
            this.attachBeam();
            // Belt-and-suspenders: also flush the shared queue for anything else enqueued.
            TextureLoader.LoadQueue().then(() => { resolve(); }).catch(() => { resolve(); });
          }
        });
      }).catch(() => {
        resolve();
      });
    });
  }

  /**
   * Parent the beam emitter to the caster's model and aim it at the target. Idempotent and
   * safe to call from either onApply() (model already loaded — re-apply) or loadModel()'s
   * completion callback (the normal async path).
   */
  attachBeam(){
    if(this.removed){
      //Effect was removed before the async model finished loading; drop the stale mesh.
      if(this.model instanceof OdysseyModel3D){ this.model.dispose(); this.model = undefined; }
      return;
    }
    if(this.attached || !(this.model instanceof OdysseyModel3D)) return;
    const caster = this.getCaster();
    if(caster && caster.model instanceof OdysseyModel3D && this.object && this.object.model instanceof OdysseyModel3D){
      // Mirror the WORKING EffectVisualEffect pattern: render the beam in WORLD space at the
      // SCENE ROOT and drive its position from the authoritative creature .position each frame
      // (see update()), instead of parenting it under caster.model. Why: the lightning emitter
      // renders 'position' as `viewMatrix * identity * position` (ShaderOdysseyEmitter
      // LINKED/LIGHTNING branch) — pure WORLD space, ignoring the model matrix — and the
      // beam-model's emitters do NOT inherit caster.model's transform during the pre-render
      // effect tick, so parenting under the caster left every emitter stuck at the world origin
      // (off-camera → invisible). Scene-root + explicit per-frame positioning removes that
      // dependency entirely.
      GameState.scene.add(this.model);

      // The bolt END = referenceNode.getWorldPosition(). enemy.model's matrixWorld is ALSO stale
      // at effect-tick time, so aim at a scene-level tracker we position at the enemy each frame.
      // (setEmitterTarget() requires an OdysseyModel3D, so wire referenceNode directly.)
      this.targetTracker = new THREE.Object3D();
      GameState.scene.add(this.targetTracker);
      for(const em of ((this.model as any).emitters || [])){
        em.referenceNode = this.targetTracker;
      }

      this.attached = true;
    }
  }

  /**
   * Resolve and assign the particle texture for each Lightning emitter directly to its shader
   * `map` uniform. Bypasses the shared, race-prone TextureLoader queue (see loadModel). Idempotent.
   */
  async bindEmitterTextures(){
    if(!(this.model instanceof OdysseyModel3D)) return;
    for(const em of ((this.model as any).emitters || [])){
      if(em.updateType !== 'Lightning') continue;
      const mat: any = em.material;
      if(!mat || mat.uniforms?.map?.value) continue;
      const resref = (em.node?.textureResRef || 'fx_lightning').toLowerCase();
      try{
        const tex = await TextureLoader.Load(resref, false);
        if(tex){
          mat.uniforms.map.value = tex;
          if('map' in mat) mat.map = tex;
          mat.depthWrite = false;
          mat.uniformsNeedUpdate = true;
          mat.needsUpdate = true;
        }
      }catch(e){ /* per-frame safety re-bind in update() will retry */ }
    }
  }

  onApply(){
    if(this.applied)
      return;

    super.onApply();

    //The beam mesh loads asynchronously (loadModel(), kicked off by ModuleObject.addEffect
    //right before this call), so this.model is usually not ready yet — attachBeam() then runs
    //from loadModel()'s completion callback. We still try here for the already-loaded case.
    this.attachBeam();
  }

  update(delta = 0){
    super.update(delta);

    //Drive the emitter so the beam particles animate while the effect is active.
    if(this.model instanceof OdysseyModel3D){
      // The diagnostic proved the model ends up orphaned (this.model.parent === null) by the time it
      // ticks — so the one-time GameState.scene.add() in attachBeam doesn't keep it in the rendered
      // graph (something detaches it). Re-parent to the scene every frame if it isn't there, so the
      // bolt is guaranteed to be rendered for the lifetime of the effect.
      if(this.model.parent !== GameState.scene){
        GameState.scene.add(this.model);
      }
      // Drive the beam (emitter START) to the caster and the tracker (bolt END) to the target,
      // in WORLD space, each frame — then refresh matrices so the emitter authors its world-space
      // geometry between the real arena positions. caster/target .position are the authoritative
      // ModuleObject world coordinates (== container world pos), so no stale-matrix dependency.
      const caster: any = this.getCaster();
      if(caster){
        // Anchor the bolt START at the caster's casting HAND, not the creature's ground origin.
        // caster.position has z≈0 (the feet), which made the bolt shoot from the floor. rhand is the
        // same hook the spell system uses as its projectileHook (SpellCastInstance); fall back to
        // lhand/handconjure, then to a raised offset above the origin if no hand node exists.
        const m: any = caster.model;
        const hook: any = m?.rhand || m?.lhand || m?.handconjure;
        if(hook?.getWorldPosition){
          hook.getWorldPosition(this.model.position);
        }else if(caster.position){
          this.model.position.copy(caster.position);
          this.model.position.z += 1.6;
        }
        this.model.updateMatrixWorld(true);
      }
      if(this.targetTracker && this.object && (this.object as any).position){
        // Aim the bolt END at the target's torso (~1 unit above its ground origin) so the lightning
        // strikes the body rather than the floor at the target's feet.
        this.targetTracker.position.copy((this.object as any).position);
        this.targetTracker.position.z += 1.0;
        this.targetTracker.updateMatrixWorld(true);
      }

      // Re-wire each Lightning emitter's endpoint to the target tracker EVERY frame (not just once
      // in attachBeam) and trip its rebuild timer so it re-authors the bolt this tick:
      //  - referenceNode: the one-time attachBeam assignment did not reliably reach the emitters
      //    that actually render (some kept a default endpoint, leaving the bolt pointed at the
      //    caster/origin). Setting it here each frame is authoritative regardless of any internal
      //    reset/rebuild of the emitter list.
      //  - _lightningDelay: tickLightning only rebuilds the position buffer when its delay timer
      //    elapses; otherwise it updates props only. Force the rebuild so the bolt tracks the live
      //    caster->target world positions every frame (also gives the natural lightning flicker).
      for(const em of ((this.model as any).emitters || [])){
        if(em.updateType === 'Lightning'){
          if(this.targetTracker) em.referenceNode = this.targetTracker;
          em._lightningDelay = em.lightningDelay || 0;
          // Safety net: if the deterministic load-time bind was bypassed (e.g. the emitter list was
          // rebuilt), re-resolve the texture once. Idempotent via the _texPending guard.
          const mat: any = em.material;
          if(mat && !mat.uniforms?.map?.value && !em._texPending){
            em._texPending = true;
            const resref = (em.node?.textureResRef || 'fx_lightning').toLowerCase();
            TextureLoader.Load(resref, false).then((tex: any) => {
              em._texPending = false;
              if(tex){ mat.uniforms.map.value = tex; if('map' in mat) mat.map = tex; mat.uniformsNeedUpdate = true; mat.needsUpdate = true; }
            }).catch(() => { em._texPending = false; });
          }
        }
      }

      this.model.update(delta);
    }

    if(this.durationEnded && this.getDurationType() == GameEffectDurationType.TEMPORARY){
      return;
    }
  }

  onRemove(){
    this.removed = true;
    //Tear down the beam mesh + the target tracker (both added to the scene root).
    if(this.model instanceof OdysseyModel3D){
      this.model.removeFromParent();
      this.model.dispose();
      this.model = undefined;
    }
    if(this.targetTracker){
      this.targetTracker.removeFromParent();
      this.targetTracker = undefined;
    }
  }

  getCaster(){
    return this.getObject(0);
  }

}
