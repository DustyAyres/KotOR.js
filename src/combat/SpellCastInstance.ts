import type { ModuleObject } from "@/module";
import type { TalentSpell } from "@/talents";
import * as THREE from "three";
import { OdysseyModel3D } from "@/three/odyssey";
// import { NWScript } from "@/nwscript/NWScript";
import { OdysseyModel, OdysseyModelAnimation } from "@/odyssey";
import { GameState } from "@/GameState";
import { MDLLoader } from "@/loaders";
import { ModuleObjectType } from "@/enums";
import { ModuleCreatureAnimState } from "@/enums/module/ModuleCreatureAnimState";
import { BitWise } from "@/utility/BitWise";

/**
 * SpellCastInstance class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file SpellCastInstance.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class SpellCastInstance {

  context: GameState;
  spell: TalentSpell;
  owner: ModuleObject;
  target: ModuleObject;
  targetLocation: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  container: THREE.Object3D = new THREE.Object3D();

  conjtime: string;
  casttime: string;
  catchtime: string;
  conjanim: string;
  hostilesetting: number;
  iconresref: any;
  projectileHook: any;
  projectileOrigin: THREE.Vector3;
  projectileTarget: THREE.Vector3;
  projectileCurve: THREE.QuadraticBezierCurve3;

  projectile: OdysseyModel3D;
  castTimeProgress: number = 0;
  projectileDistance: THREE.Vector3;
  casthandmodel: OdysseyModel3D;
  impactscript: string;
  casthandvisual: string;
  flags: number;

  impacted: boolean = false;
  completed: boolean = false;
  conjureTime = 3000;
  conjuring: boolean = false;
  castAnimStarted: boolean = false;
  castTime: number = 0;

  constructor(caster: ModuleObject, target: ModuleObject, spell: TalentSpell){
    this.context = caster.context;
    this.owner = caster;
    this.target = target;
    this.spell = spell;

    // The impactscript resolves its AoE / shape center via GetSpellTargetLocation (#222), which
    // returns this.talent.oTarget's location and FALLS BACK to world origin (0,0,0) when oTarget
    // isn't a valid object. In the UI cast path the talent reaching impact() can arrive with
    // oTarget unset, so GetFirstObjectInShape searches around the origin and finds nothing — no
    // damage AND no beam VFX get applied. Pin oTarget to this cast's actual target.
    if(spell && target){
      spell.oTarget = target;
    }

    //Seed the per-cast fields off the spells.2da row. Without this the impactscript
    //is undefined -> impact() runs Load(undefined) (a no-op) and the spell deals no
    //damage; conjureTime stays hardcoded 3000 and castTime stays 0 (so impact() is
    //never reached for S/M-range powers). spells.2da conjtime/casttime are in ms.
    if(spell){
      this.impactscript = spell.impactscript;
      this.casthandvisual = spell.casthandvisual;
      this.conjanim = spell.conjanim;
      this.conjureTime = Math.max(Number(spell.getConjureTime()) || 0, 0);
      this.castTime = Math.max(Number(spell.getCastTime()) || 0, 0);
    }
  }

  init(){
    this.projectileHook = undefined;
    this.projectileOrigin = new THREE.Vector3();
    this.projectileTarget = new THREE.Vector3();
    this.projectileCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3( 0, 0, 0 ),
      new THREE.Vector3( 0, 0, 0 ),
      new THREE.Vector3( 0, 0, 0 )
    );

    if(this.target){
      this.projectileTarget.copy(this.target.position);
      this.projectileTarget.x += Math.random() * (0.25 - -0.25) + -0.25;
      this.projectileTarget.y += Math.random() * (0.25 - -0.25) + -0.25;
      this.projectileCurve.v2.copy(this.projectileTarget);
    }

    if(this.spell.projmodel != ''){
      console.log('projectile', this.spell.projmodel);
      MDLLoader.loader.load(this.spell.projmodel.toLowerCase())
      .then((mdl: OdysseyModel) => {
        OdysseyModel3D.FromMDL(mdl, {
          context: this.owner.context
        }).then((model: OdysseyModel3D) => {
          this.projectile = model;
          console.log('projectile', model);
          if(this.owner.model){
            if(this.owner.model.rhand){
              this.owner.context.group.effects.add(model);
              this.projectileHook = this.owner.model.rhand;
              //TextureLoader.LoadQueue();
            }else{
              this.projectile.dispose();
            }
          }else{
            this.projectile.dispose();
          }

        });
      });
    }
  }

  update(delta: number = 0){
    if(this.conjureTime > 0){
      this.conjuring = true;
      this.conjureTime -= (1000 * delta);

      if(this.projectile && this.projectileHook){
        this.projectileHook.getWorldPosition(this.projectile.position);
        this.projectileOrigin.copy(this.projectile.position);
        this.projectileCurve.v0.copy(this.projectileOrigin);
      }
      //combatAction.casting = true;
    }else if(this.castTime > 0){
      this.conjuring = false;

      // Entering the CAST phase: switch from the one-shot conjure wind-up to the LOOPING
      // channel/hold pose (castoutlp*, driven by castanim). Play it ONCE. The CASTOUT1 index
      // sentinel keeps it from being clobbered by the combat-ready / turning state machines
      // (see ActionCastSpell.update). The clip is selected by name (updateAnimationState
      // reads animationState.animation, not .index).
      if(!this.castAnimStarted){
        this.castAnimStarted = true;
        if(this.owner && BitWise.InstanceOfObject(this.owner, ModuleObjectType.ModuleCreature)){
          const creature: any = this.owner;
          const castName = this.spell.getCastingAnimation();
          if(castName){
            const castAnim = OdysseyModelAnimation.GetAnimation2DA(castName);
            if(castAnim){
              creature.playTwoDAAnimation(castAnim);
              creature.animationState.index = ModuleCreatureAnimState.CASTOUT1;
            }
          }
        }
      }

      this.castTimeProgress = this.castTime / (this.spell.getCastTime() * 0.5);
      if(this.castTimeProgress > 1){
        this.castTimeProgress = 1;
      }

      if(this.projectile && !this.projectileDistance){
        this.projectileDistance = this.projectileTarget.clone().sub(this.projectileOrigin);
        this.projectileCurve.v1.copy(this.projectileDistance).multiplyScalar(0.25).add(this.projectileOrigin);
        this.projectileCurve.v1.z += 2
      }

      if(this.spell.range != 'L'){
        this.impact();
      }

      if(this.projectile && this.projectileDistance){
        this.projectile.position.copy( this.projectileCurve.getPoint((1 - this.castTimeProgress)) );
      }

      this.castTime -= (1000 * delta);
      //this.casting = true;
    }else{
      this.conjuring = false;

      //Impact unconditionally at the end of the cast. The `impacted` guard inside
      //impact() prevents a double-run for non-'L' powers that already impacted in the
      //castTime branch; this covers powers with casttime==0 (which would otherwise
      //never reach impact() unless range=='L').
      this.impact();

      if(!this.completed){
        //I guess the spell is over now
        this.completed = true;

        // Cast finished: stop the looping channel pose and hand the caster back to the
        // combat/idle state machine (the loop never ends on its own). Guarded by the
        // CASTOUT1 sentinel so we only reset if we're still showing our own cast pose
        // (don't stomp a newer state). Runs once — the area disposes the instance after
        // this frame (ModuleArea.update).
        if(this.owner && BitWise.InstanceOfObject(this.owner, ModuleObjectType.ModuleCreature)){
          const creature: any = this.owner;
          if(creature.animationState.index === ModuleCreatureAnimState.CASTOUT1){
            creature.setAnimationState(
              creature.combatData.combatState ? ModuleCreatureAnimState.READY : ModuleCreatureAnimState.PAUSE
            );
          }
        }
      }
    }

    if(this.casthandmodel){
      this.casthandmodel.update(delta);
    }

    if(this.projectile){
      this.projectile.update(delta);
    }
  }  

  impact(){
    //We only want to run the impact script once
    if(this.impacted) return;
    this.impacted = true;

    // NOTE: the caster's body animation is NOT (re)played here. The conjure wind-up
    // (ActionCastSpell.update) and the looping channel pose (this.update's cast phase) own
    // the cast animation; update()'s completion branch returns the caster to ready/idle.
    // impact() only fires the impactscript + the hand VFX model.

    // k_sp1_generic (and friends) resolve their target + AoE shape-center via
    // GetSpellTargetObject() (= caller.combatData.lastSpellTarget) -> GetLocation(oTarget).
    // beginCombatRound clears lastSpellTarget at round start, so by impact time it is undefined
    // and GetLocation returns WORLD ORIGIN -> GetFirstObjectInShape finds nobody, so neither the
    // damage NOR the beam VFX get applied. Restore the caster's last spell target for the script.
    if(this.owner && this.target && (this.owner as any).combatData){
      (this.owner as any).combatData.lastSpellTarget = this.target;
    }

    if(this.impactscript){
      console.log('Casting spell', this.impactscript, this);
      const instance = GameState.NWScript.Load(this.impactscript);
      if(instance) {
        //pass the talent to the script instance and run it
        instance.talent = this.spell;
        //instance.spellTarget = oTarget;
        instance.run(this.owner, 0);
      };
    }

    if(this.casthandvisual){
      MDLLoader.loader.load(this.casthandvisual)
      .then((mdl: OdysseyModel) => {
        OdysseyModel3D.FromMDL(mdl, {
          context: this.owner.context
        }).then((model: OdysseyModel3D) => {
          this.casthandmodel = model;

          if(this.owner.model){
            if(this.owner.model.lhand){
              this.owner.model.lhand.add(this.casthandmodel);
              //TextureLoader.LoadQueue();

              const anim = this.casthandmodel.playAnimation('cast01', false);
              setTimeout(() => {
                //Clean up the impact effect
                this.casthandmodel.dispose();
              }, (anim ? anim.length * 1000 : 1500) )
            }else{
              this.casthandmodel.dispose();
            }
          }else{
            this.casthandmodel.dispose();
          }

        });
      });
    }

    if(this.projectile){
      this.projectile.dispose();
    }

  }

  dispose(){

    if(this.casthandmodel) this.casthandmodel.dispose();
    if(this.projectile) this.projectile.dispose();
    if(this.container) this.container.removeFromParent();
  }

}