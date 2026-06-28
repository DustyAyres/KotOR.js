import { CombatAttackDamage } from "@/combat/CombatAttackDamage";
import type { ModuleCreature, ModuleItem, ModuleObject } from "@/module";
import { CExoLocString } from "@/resource/CExoLocString";
import { GFFStruct } from "@/resource/GFFStruct";
import { DamageType } from "@/enums/combat/DamageType";
import { EffectDamage } from "@/effects";
import { GameEffectDurationType } from "@/enums/effects/GameEffectDurationType";
import { AttackResult } from "@/enums/combat/AttackResult";
import { TalentFeat } from "@/talents";
import { CombatFeatType } from "@/enums/combat/CombatFeatType";
import { Dice } from "@/utility/Dice";
import { DiceType } from "@/enums/combat/DiceType";
import { WeaponType } from "@/enums/combat/WeaponType";

/**
 * CombatAttackData class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file CombatAttackData.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CombatAttackData {
  /**
   * The attack group for the attack
   */
  attackGroup: number = 0;

  /**
   * The animation length for the attack
   */
  animationLength: number = 1500;

  /**
   * The missed by object for the attack
   */
  missedBy: ModuleObject = undefined;

  /**
   * The attack result for the attack
   */
  attackResult: AttackResult = AttackResult.MISS;

  /**
   * The reaction object for the attack
   */
  reactObject: ModuleObject = undefined;

  /**
   * The reaction delay for the attack
   */
  reaxnDelay: number = 0;

  /**
   * The reaction animation for the attack
   */
  reaxnAnimation: number = 10001;

  /**
   * The reaction animation length for the attack
   */
  reaxnAnimLength: number = 0;

  /**
   * Whether the attack is concealed
   */
  concealment: boolean = false;

  /**
   * Whether the attack is a type attack
   */
  attackType: boolean = false;

  /**
   * The attack mode for the attack
   */
  attackMode: number = 0;

  /**
   * Whether the attack is a ranged attack
   */
  rangedAttack: boolean = false;

  /**
   * Whether the attack is a sneak attack
   */
  sneakAttack: boolean = false;

  /**
   * The weapon attack type for the attack
   */
  weaponAttackType: number = 0;

  /**
   * The ranged target X coordinate
   */
  rangedTargetX: number = 0;

  /**
   * The ranged target Y coordinate
   */
  rangedTargetY: number = 0;

  /**
   * The ranged target Z coordinate
   */
  rangedTargetZ: number = 0;

  /**
   * The damage list for the attack
   */
  damageList: CombatAttackDamage[] = new Array(15);

  /**
   * The killing blow for the attack
   */
  killingBlow: boolean = false;

  /**
   * The coup de grace for the attack
   */
  coupDeGrace: boolean = false;

  /**
   * The critical threat for the attack
   */
  criticalThreat: number = 0;

  /**
   * The attack deflected for the attack
   */
  attackDeflected: number = 0;

  /**
   * The ammo item that is being used for the attack
   */
  ammoItem: ModuleObject = undefined;

  /**
   * The debug text for the attack
   */
  attackDebugText: CExoLocString;

  /**
   * The debug text for the damage
   */
  DamageDebugText: CExoLocString;

  /**
   * The weapon that is being used for the attack
   */
  attackWeapon: ModuleItem;

  /**
   * Constructor for the CombatAttackData class
   */
  constructor(){
    this.damageList = new Array(15);
    for(let i = 0; i < 15; i++){
      this.damageList[i] = new CombatAttackDamage();
    }
  }

  /**
   * Calculate the damage for the combat attack data
   * @param creature - The creature to calculate the damage for
   * @param isCritial - Whether the attack is a critical hit
   * @param feat - The feat that is being used for the attack
   */
  calculateDamage(creature: ModuleCreature, isCritial: boolean = false, feat?: TalentFeat){
    /**
     * Unarmed Strike
     */
    if(!this.attackWeapon){
      const damageMultiplier = isCritial ? 2.0 : 1.0;
      const nDamage = Dice.roll(1, DiceType.d4);
      this.damageList[DamageType.BLUDGEONING].addDamage(nDamage * damageMultiplier);

      return;
    };

    const damageMultiplier = isCritial ? this.attackWeapon.baseItem.criticalHitMultiplier : 1.0;

    if(!creature.isSimpleCreature()){
      this.damageList[this.attackWeapon.getBaseDamageType()].addDamage(this.attackWeapon.getBaseDamage() * damageMultiplier);
      if(this.attackWeapon.hasDamageBonus()){
        this.damageList[this.attackWeapon.getDamageBonusType()].addDamage(this.attackWeapon.getDamageBonus() * damageMultiplier);
      }

      /**
       * Power Attack / Power Blast damage (dump FUN_006abf70, power-attack mode byte
       * at stats+0x512): basic tier (mode 2) = +3, improved/master tier (mode 3) = +7,
       * crit-multiplied. Gated on the ACTIVE attack form (the feat selected for this
       * round) — NOT passive feat ownership — and the tiers do NOT stack. The previous
       * code added +5/+8/+10 and STACKED them (a master owner got +23) on passive
       * getHasFeat; this matches the binary. K2 feat ids via CombatFeatType.
       */
      if(feat){
        switch(feat.id){
          case CombatFeatType.POWER_ATTACK:
          case CombatFeatType.POWER_BLAST:
            this.damageList[DamageType.BASE].addDamage(3 * damageMultiplier);
          break;
          case CombatFeatType.IMPROVED_POWER_ATTACK:
          case CombatFeatType.IMPROVED_POWER_BLAST:
          case CombatFeatType.MASTER_POWER_ATTACK:
          case CombatFeatType.MASTER_POWER_BLAST:
            this.damageList[DamageType.BASE].addDamage(7 * damageMultiplier);
          break;
        }
      }

      /**
       * Weapon Specialization = +2 damage (dump FUN_006abf70 gated on FUN_006b8ee0):
       * passive and data-driven from the equipped weapon's baseitems.2da specfeat
       * column. Crit-multiplied.
       */
      const specBonus = this.calculateWeaponSpecBonus(creature, this.attackWeapon);
      if(specBonus > 0){
        this.damageList[DamageType.BASE].addDamage(specBonus * damageMultiplier);
      }

      // EffectDamageIncrease/Decrease (Force buffs, item/feat weapon-damage bonuses). Flat bonus
      // (DAMAGE_BONUS_n = n), crit-multiplied like the other weapon-damage bonuses.
      const effectDamageBonus = creature.getDamageEffectBonus();
      if(effectDamageBonus){
        this.damageList[DamageType.BASE].addDamage(effectDamageBonus * damageMultiplier);
      }

    }else{
      this.damageList[this.attackWeapon.getBaseDamageType()].addDamage(this.attackWeapon.getMonsterDamage() * damageMultiplier);
      if(this.attackWeapon.hasDamageBonus()){
        this.damageList[this.attackWeapon.getDamageBonusType()].addDamage(this.attackWeapon.getDamageBonus() * damageMultiplier);
      }
    }

    //Add strength MOD to melee damage
    if(this.attackWeapon.getWeaponType() == WeaponType.PIERCING){
      this.damageList[DamageType.PHYSICAL].addDamage( Math.floor(( creature.getSTR() - 10) / 2) );
    }

    if(this.getTotalDamage() >= this.reactObject.getHP()){
      this.killingBlow = true;
    }

  }

  /**
   * Calculate the weapon specialization bonus
   * @param creature - The creature to calculate the weapon specialization bonus for
   * @param weapon - The weapon to calculate the weapon specialization bonus for
   * @returns The weapon specialization bonus
   */
  calculateWeaponSpecBonus(creature: ModuleCreature, weapon: ModuleItem): number {
    if(!creature || !weapon){ return 0; }

    /**
     * Data-driven Weapon Specialization (dump FUN_006b8ee0): read the equipped
     * weapon's baseitems.2da specfeat column and, if it names a feat the wielder
     * owns, grant +2. Per-category spec feats (46-52) auto-resolve from the data,
     * replacing the old hardcoded WeaponWield/baseItemId(8/9/10) switch.
     */
    const specFeat = weapon.baseItem ? weapon.baseItem.specFeat : -1;
    if(specFeat >= 0 && creature.getHasFeat(specFeat)){
      return 2;
    }
    return 0;
  }

  /**
   * Apply the damage effect to the target creature
   * @param owner - The owner of the damage effect
   * @param target - The target creature to apply the damage effect to
   */
  applyDamageEffectToCreature(owner: ModuleCreature, target: ModuleCreature){
    if(!target) return;
    const damageEffect = new EffectDamage();
    damageEffect.setCreator(owner);

    let typeMask = 0;
    for(let i = 0; i < 15; i++){
      const damage = this.damageList[i];
      damageEffect.setInt(i, damage.damageValue);
      // Build the damage-type flag mask from the real damage types (0..12) so the
      // mitigation pipeline / getDamageType() can key off it (dump record type mask).
      if(i <= 12 && damage.damageValue > 0){
        typeMask |= (1 << i);
      }
    }

    // Stamp the damage type mask + penetration power (slots 17/18) the mitigation
    // pipeline reads. Weapon penetration power is not modelled yet, so 0 (an
    // unupgraded hit), which means flat Damage Reduction (DR n/+power) still applies.
    damageEffect.setInt(17, typeMask);
    damageEffect.setInt(18, 0);

    target.addEffect(damageEffect, GameEffectDurationType.INSTANT);
  }

  /**
   * Get the total damage of the combat attack data
   * @returns The total damage
   */
  getTotalDamage(): number {
    let amount = 0;
    for(let i = 0; i < this.damageList.length; i++){
      const damage = this.damageList[i];
      if(damage.damageValue > 0){
        amount += damage.damageValue;
      }
    }
    return amount;
  }

  /**
   * Reset the combat attack data
   */
  reset(){
    this.killingBlow = false;
    this.reactObject = undefined;
    this.attackWeapon = undefined;
    this.attackResult = AttackResult.MISS;
    for(let i = 0; i < this.damageList.length; i++){
      this.damageList[i].reset();
    }
  }

  /**
   * Convert the combat attack data to a GFF struct
   * @param structIdx - The index of the struct
   * @returns The GFF struct
   */
  toStruct(structIdx: number = -1){
    const struct = new GFFStruct(structIdx);

    return struct;
  }

}