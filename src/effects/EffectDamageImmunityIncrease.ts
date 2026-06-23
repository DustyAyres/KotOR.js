import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";

/**
 * EffectDamageImmunityIncrease class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file EffectDamageImmunityIncrease.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectDamageImmunityIncrease extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectDamageImmunityIncrease;

    this.setNumIntegers(2);

    //intList[0] : nDamageType    - damage-type flag mask (covers type T when flags & (1<<T))
    //intList[1] : nPercentImmunity - percent damage immunity for the covered types
  }

  getDamageType(){
    return this.getInt(0);
  }

  getPercentImmunity(){
    return this.getInt(1);
  }

  onApply(){
    if(this.applied)
      return;
      
    super.onApply();
  }

}
