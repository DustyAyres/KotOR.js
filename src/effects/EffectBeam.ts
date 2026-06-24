import { GameEffect } from "@/effects/GameEffect";
import { GameState } from "@/GameState";
import { GameEffectDurationType } from "@/enums/effects/GameEffectDurationType";
import { GameEffectType } from "@/enums/effects/GameEffectType";
import { MDLLoader } from "@/loaders";
// import { TwoDAManager } from "@/managers/TwoDAManager";
import { OdysseyModel } from "@/odyssey";
import { OdysseyModel3D } from "@/three/odyssey";

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
          onComplete: (model: OdysseyModel3D) => {
            this.model = model;
            // ModuleObject.addEffect calls loadModel() then onApply() on the SAME tick, so
            // onApply ran before this async load finished and its `this.model` guard failed
            // (the beam never attached). Attach here, once the mesh is actually ready — this
            // is the fix for force-power beams (lightning/shock/storm/drain) not rendering.
            this.attachBeam();
            resolve();
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
      //Add the beam to the caster's model
      caster.model.add(this.model);
      //Set the target node of the BeamEffect emitter
      this.model.setEmitterTarget(this.object.model);
      this.attached = true;
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
      this.model.update(delta);
    }

    if(this.durationEnded && this.getDurationType() == GameEffectDurationType.TEMPORARY){
      return;
    }
  }

  onRemove(){
    this.removed = true;
    //Tear down the beam mesh (OdysseyModel3D.dispose removes it from the caster's model).
    if(this.model instanceof OdysseyModel3D){
      this.model.dispose();
      this.model = undefined;
    }
  }

  getCaster(){
    return this.getObject(0);
  }

}
