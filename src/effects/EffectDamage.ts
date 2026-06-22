import { GameEffect } from "@/effects/GameEffect";
import { GameEffectType } from "@/enums/effects/GameEffectType";
import { ModuleObjectType } from "@/enums/module/ModuleObjectType";
import { BitWise } from "@/utility/BitWise";
import {
  mitigateDamage,
  DamageResistanceShield,
  DamageImmunity,
  DamageReducer,
} from "@/combat/CombatMath";

/**
 * EffectDamage class.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file EffectDamage.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class EffectDamage extends GameEffect {
  constructor(){
    super();
    this.type = GameEffectType.EffectDamage;

    this.setNumIntegers(21);
    this.intList.fill(-1, 0, 16);

    //intList[0] : -1 or Bludgeoning Damage Amount
    //intList[1] : -1 or Piercing Damage Amount
    //intList[2] : -1 or Slashing Damage Amount
    //intList[3] : -1 or Universal Damage Amount
    //intList[4] : -1 or Acid Damage Amount
    //intList[5] : -1 or Cold Damage Amount
    //intList[6] : -1 or Lightside Damage Amount
    //intList[7] : -1 or Electrical Damage Amount
    //intList[8] : -1 or Fire Damage Amount
    //intList[9] : -1 or Darkside Damage Amount
    //intList[10] : -1 or Sonic Damage Amount
    //intList[11] : -1 or Ion Damage Amount
    //intList[12] : -1 or Energy Damage Amount
    //intList[13] : -1 or Base Damage Amount
    //intList[14] : -1 or Physical Damage Amount
    //intList[16] : 1000
    //intList[17] : Damage Type (flag mask)
    //intList[18] : Damage Power

  }

  onApply(){
    if(this.applied)
      return;

    super.onApply();

    if(BitWise.InstanceOf(this.object?.objectType, ModuleObjectType.ModuleObject)){
      this.object.subtractHP(this.getMitigatedDamage());
      this.object.combatData.lastDamager = this.creator;
      this.object.combatData.lastAttacker = this.creator;
    }
  }

  /**
   * Raw per-type damage total of this hit, before mitigation, floored to [1, 10000].
   * The damage is distributed across the per-type slots (0..14, indexed by
   * DamageType); summing them is the assembled total the dump's FUN_006adec0 floors
   * to 1 before mitigation. (Previously this returned only slot 14, so combat applied
   * just the STR-mod portion of a hit.)
   */
  getDamageAmount(){
    let total = 0;
    for(let t = 0; t <= 14; t++){
      const v = this.getInt(t) | 0;
      if(v > 0) total += v;
    }
    return Math.min(Math.max(total, 1), 10000);
  }

  /**
   * The HP this hit actually removes: the assembled per-type total run through the
   * dump's three-stage mitigation pipeline (Immunity % -> Resistance -> Reduction),
   * keyed on the target creature's active mitigation effects. Depletes the matched
   * resistance / reduction pools.
   */
  getMitigatedDamage(): number {
    const perType: number[] = [];
    for(let t = 0; t <= 14; t++){
      const v = this.getInt(t) | 0;
      perType[t] = v > 0 ? v : 0;
    }

    const target = this.object;
    const effects: GameEffect[] = (target && Array.isArray(target.effects)) ? target.effects : [];

    const immunities: DamageImmunity[] = [];
    const shields: DamageResistanceShield[] = [];
    const shieldEffects: GameEffect[] = [];
    const reducers: DamageReducer[] = [];
    const reducerEffects: GameEffect[] = [];

    for(const effect of effects){
      switch(effect.type){
        case GameEffectType.EffectDamageImmunityIncrease:
          // intList[0] : damage-type flag mask, intList[1] : percent immunity
          immunities.push({ flags: effect.getInt(0) | 0, pct: effect.getInt(1) | 0 });
        break;
        case GameEffectType.EffectDamageImmunityDecrease:
          // intList[0] : damage-type flag mask, intList[1] : percent vulnerability
          immunities.push({ flags: effect.getInt(0) | 0, pct: -(effect.getInt(1) | 0) });
        break;
        case GameEffectType.EffectDamageResistance:
          // intList[0] : type flags, intList[1] : points/hit, intList[2] : pool
          shields.push({ flags: effect.getInt(0) | 0, perHit: effect.getInt(1) | 0, pool: effect.getInt(2) | 0 });
          shieldEffects.push(effect);
        break;
        case GameEffectType.EffectDamageReduction:
          // intList[0] : flat amount, intList[1] : required power, intList[2] : pool
          reducers.push({ amount: effect.getInt(0) | 0, power: effect.getInt(1) | 0, pool: effect.getInt(2) | 0 });
          reducerEffects.push(effect);
        break;
      }
    }

    const total = mitigateDamage(perType, immunities, shields, reducers, this.getDamagePower() | 0);

    // Write back depleted pools so multi-hit absorption decrements over time.
    for(let i = 0; i < shieldEffects.length; i++){
      shieldEffects[i].setInt(2, shields[i].pool);
    }
    for(let i = 0; i < reducerEffects.length; i++){
      reducerEffects[i].setInt(2, reducers[i].pool);
    }

    return total;
  }

  getDamageType(){
    return this.getInt(17);
  }

  getDamagePower(){
    return this.getInt(18);
  }

}
