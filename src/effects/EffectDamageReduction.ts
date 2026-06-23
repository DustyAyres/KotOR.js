import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";

/**
 * EffectDamageReduction class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file EffectDamageReduction.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectDamageReduction extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectDamageReduction;

    this.setNumIntegers(3);

    //intList[0] : nAmount   - flat points of damage removed ("DR n")
    //intList[1] : nDamagePower - required penetration power; DR applies only when
    //                            the attacker's power is below this ("/+power")
    //intList[2] : nLimit    - remaining absorption pool (0 == infinite)
  }

  getAmount(){
    return this.getInt(0);
  }

  getDamagePower(){
    return this.getInt(1);
  }

  getLimit(){
    return this.getInt(2);
  }

  onApply(){
    if(this.applied)
      return;

    super.onApply();
  }

}

