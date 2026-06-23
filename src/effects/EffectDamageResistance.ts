import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";

/**
 * EffectDamageResistance class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file EffectDamageResistance.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectDamageResistance extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectDamageResistance;
    
    //intList[0] : nDamageType  - damage-type flag mask (covers type T when flags & (1<<T))
    //intList[1] : nAmount       - points of damage removed per hit, per covered type
    //intList[2] : nLimit        - remaining absorption pool (0 == infinite)
    //intList[3] : nVulnerabilityFlags

  }

  onApply(){
    if(this.applied)
      return;
      
    super.onApply();
  }

}

