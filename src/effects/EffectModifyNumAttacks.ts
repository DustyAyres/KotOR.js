import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";

/**
 * EffectModifyNumAttacks class.
 *
 * Grants extra melee attacks per round (used by Force Speed / Knight Speed / Speed Mastery and
 * the Valor line, which add a bonus attack). The bonus is consumed each round by
 * CombatRound.beginCombatRound -> additionalAttacks. The effect itself just carries the count.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file EffectModifyNumAttacks.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectModifyNumAttacks extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectModifyNumAttacks;

    //intList[0] : nNumAttacks - extra attacks per round. The engine sums this with
    //haste/speed effects and caps the COMBINED effect bonus at 2 (dump FUN_005922c0),
    //applied in CombatRound.beginCombatRound -> additionalAttacks.
  }

  onApply(){
    if(this.applied)
      return;

    super.onApply();
  }

}
