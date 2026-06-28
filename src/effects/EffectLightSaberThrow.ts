import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";
import { ModuleObjectType } from "@/enums/module/ModuleObjectType";
import { BitWise } from "@/utility/BitWise";
import { Dice } from "@/utility/Dice";
import { DiceType } from "@/enums/combat/DiceType";

/**
 * EffectLightSaberThrow class.
 *
 * The thrown-lightsaber Force power (FORCE_POWER_LIGHT_SABER_THROW / _ADVANCED). The routine
 * (NWScriptDefK1 #702) was a no-action stub, so the power applied nothing and the unguarded
 * ApplyEffectToObject crashed on it. The saber strikes its target for lightsaber-class damage.
 *
 * objectList[0..2] : up to three targets the saber travels to (the effect is applied per-target).
 * intList[0]       : attack/damage bonus passed from the routine.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file EffectLightSaberThrow.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectLightSaberThrow extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectLightSaberThrow;
  }

  onApply(){
    if(this.applied)
      return;

    super.onApply();

    // The effect is applied to the CASTER (OBJECT_SELF); the thrown saber travels to the
    // targets stored in objectList[0..2] and strikes each. Deal lightsaber-class damage to those
    // targets (not this.object, which is the caster). We subtract HP directly (mirroring
    // EffectDamage's core) rather than running a full thrown-weapon attack — a faithful throw is
    // an attack action, but this makes the power functional instead of a no-op/crash.
    const bonus = this.getInt(0) || 0;
    for(let i = 0; i < 3; i++){
      const target: any = this.getObject(i);
      if(!BitWise.InstanceOf(target?.objectType, ModuleObjectType.ModuleObject) || typeof target.subtractHP !== 'function'){
        continue;
      }
      const amount = Math.max(Dice.roll(2, DiceType.d6, bonus), 1);
      target.subtractHP(amount);
      if(target.combatData){
        target.combatData.lastDamager = this.creator;
        target.combatData.lastAttacker = this.creator;
      }
      if(typeof target.onDamaged === 'function' && BitWise.InstanceOf((this.creator as any)?.objectType, ModuleObjectType.ModuleObject)){
        target.onDamaged();
      }
    }
  }

}
