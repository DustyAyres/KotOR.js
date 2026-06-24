import { Action } from "@/actions/Action";
import { SpellCastInstance } from "@/combat";
import { ModuleObjectType } from "@/enums";
import { ActionParameterType } from "@/enums/actions/ActionParameterType";
import { ActionStatus } from "@/enums/actions/ActionStatus";
import { ActionType } from "@/enums/actions/ActionType";
import { ModuleCreatureAnimState } from "@/enums/module/ModuleCreatureAnimState";
import { ModuleObjectConstant } from "@/enums/module/ModuleObjectConstant";
import { OdysseyModelAnimation } from "@/odyssey";
import { GameState } from "@/GameState";
// import { TalentSpell } from "@/talents/TalentSpell";
import { BitWise } from "@/utility/BitWise";
import type { ModuleObject } from "@/module/ModuleObject";

/**
 * ActionCastSpell class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file ActionCastSpell.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class ActionCastSpell extends Action {
  
  spell: any = {}

  constructor( actionId: number = -1, groupId: number = -1 ){
    super(actionId, groupId);
    this.type = ActionType.ActionCastSpell;

    //PARAMS
    // 0 - int: nSpellId
    // 1 - int: Unknown: -1 if cheat enabled
    // 2 - int: nDomainLevel
    // 3 - int: Unknown: Always 0?
    // 4 - int: Unknown: Always 0?
    // 5 - dword: target object id
    // 6 - float: target x
    // 7 - float: target y
    // 8 - float: target z
    // 9 - int: nProjectilePath
    // 10 - int: Unknown: Always -1?
    // 11 - int: Unknown: -1 if cheat enabled

  }

  update(delta: number = 0): ActionStatus {
    //console.log('ActionCastSpell', this);
    this.target = this.getParameter<ModuleObject>(5);
    this.spell = new GameState.TalentSpell( this.getParameter<number>(0));

    if(this.spell){
      if(!this.spell.inRange(this.target, this.owner)){

        // (this.owner as any).openSpot = undefined;
        let actionMoveToTarget = new GameState.ActionFactory.ActionMoveToPoint(this.groupId);
        actionMoveToTarget.setParameter(0, ActionParameterType.FLOAT, this.target.position.x);
        actionMoveToTarget.setParameter(1, ActionParameterType.FLOAT, this.target.position.y);
        actionMoveToTarget.setParameter(2, ActionParameterType.FLOAT, this.target.position.z);
        actionMoveToTarget.setParameter(3, ActionParameterType.DWORD, GameState.module.area.id);
        actionMoveToTarget.setParameter(4, ActionParameterType.DWORD, this.target ? this.target.id : ModuleObjectConstant.OBJECT_INVALID);
        actionMoveToTarget.setParameter(5, ActionParameterType.INT, 1);
        actionMoveToTarget.setParameter(6, ActionParameterType.FLOAT, this.spell.getCastRange() );
        actionMoveToTarget.setParameter(7, ActionParameterType.INT, 0);
        actionMoveToTarget.setParameter(8, ActionParameterType.FLOAT, 30.0);
        this.owner.actionQueue.addFront(actionMoveToTarget);

        return ActionStatus.IN_PROGRESS;

      }else{
        if(BitWise.InstanceOfObject(this.owner, ModuleObjectType.ModuleCreature)){
          this.owner.force = 0;
          this.owner.speed = 0;
        }

        if(this.owner.combatRound){
          const combatRound = this.owner.combatRound;
          if(!combatRound.roundPaused) {
            
            combatRound.beginCombatRound();
            combatRound.pauseRound(this.owner, combatRound.roundLength);
            if(combatRound.action){
              combatRound.action.animation = ModuleCreatureAnimState.CASTOUT1;
            }

            // Play the caster's CONJURE (wind-up) pose, mirroring how attacks animate
            // (cf. CombatRound.calculateRoundAnimations -> creature.playTwoDAAnimation +
            // animationState.index). getConjureAnimation() is the ONE-SHOT castout* wind-up
            // (driven by conjanim). SpellCastInstance.update() then switches to the LOOPING
            // castoutlp* channel pose (driven by castanim) when the cast phase begins, and
            // hands the caster back to ready/idle on completion.
            //
            // animationState.index = CASTOUT1 is a SENTINEL, not a clip selector: the played
            // clip is the .animation set by playTwoDAAnimation (updateAnimationState reads
            // .animation, not .index — and animationConstantToAnimation has NO CASTOUT case).
            // Crucially CASTOUT1 is NOT in the READY-promotion check (ModuleCreature ~637:
            // index==PAUSE) nor the turning set (~732 stationaryTurnStates), so it shields the
            // cast pose from being clobbered mid-cast.
            if(BitWise.InstanceOfObject(this.owner, ModuleObjectType.ModuleCreature)){
              const caster: any = this.owner;
              const conjureName = this.spell.getConjureAnimation();
              if(conjureName){
                const conjureAnim = OdysseyModelAnimation.GetAnimation2DA(conjureName);
                if(conjureAnim){
                  caster.playTwoDAAnimation(conjureAnim);
                  caster.animationState.index = ModuleCreatureAnimState.CASTOUT1;
                }
              }
            }

            if(combatRound.roundStarted){
              const spellCastInstance = new SpellCastInstance(this.owner, combatRound.action.target, combatRound.action.spell);
              this.owner.area.attachSpellInstance(spellCastInstance);
              spellCastInstance.init();

              return ActionStatus.COMPLETE;
            }

          }
          return ActionStatus.IN_PROGRESS;
        }else{
          return ActionStatus.FAILED;
        }
      }
    }

    return ActionStatus.FAILED;
  }

}
