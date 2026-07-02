import type { ModuleCreature, ModuleItem, ModuleObject } from "@/module";
import { CombatActionType } from "@/enums/combat/CombatActionType";
import { TalentFeat, TalentSpell } from "@/talents";
import { AttackResult } from "@/enums/combat/AttackResult";
import { ProjectilePath } from "@/enums/combat/ProjectilePath";
import { OdysseyModelAnimation } from "@/odyssey";
import { ITwoDAAnimation } from "@/interface/twoDA/ITwoDAAnimation";
import { SpellCastInstance } from "@/combat/SpellCastInstance";
import { CombatFeatType } from "@/enums/combat/CombatFeatType";
import { BitWise } from "@/utility/BitWise";
import { ModuleObjectType } from "@/enums";

export class CombatRoundAction {
  owner: ModuleObject;

  actionTimer: number = 0;
  animation: number = 0;
  animationTime: number = 0;
  animationName: string = '';
  twoDAAnimation: ITwoDAAnimation;

  numAttacks: number = 0;
  actionType: CombatActionType = CombatActionType.INVALID;
  target: ModuleObject;
  retargettable: number = 0;
  inventorySlot: ModuleObject;
  targetRepository: ModuleObject;

  isUserAction: boolean = false; //Was this action created by the player
  isCutsceneAttack: boolean = false;

  resultsCalculated: boolean = false;
  attackAnimation: number = 10001;
  attackResult: AttackResult = AttackResult.MISS;
  attackDamage: number = 0;

  iconResRef: string;

  featId: number = -1;
  feat: TalentFeat;

  spellId: number = -1;
  spell: TalentSpell;
  spellInstance: SpellCastInstance;
  spellClassIndex: number = -1;
  domainLevel: number = 0;
  projectilePath: ProjectilePath = ProjectilePath.DEFAULT;
  overrideSpellId: number = -1;
  overrideSpell: TalentSpell;

  item: ModuleItem;
  activePropertyIndex: number = -1;

  equipInstant: boolean = false;

  constructor(owner?: ModuleObject){
    this.owner = owner;
    this.iconResRef = 'i_attack';
  }

  setFeat(feat: TalentFeat){
    if(!feat){
      this.featId = -1;
      this.feat = undefined;
      return;
    }
    this.feat = feat;
    this.featId = feat.id;
    this.iconResRef = feat.icon;
  }

  setSpell(spell: TalentSpell){
    if(!spell){
      this.spellId = -1;
      this.spell = undefined;
      return;
    }
    this.spell = spell;
    this.spellId = spell.id;
    this.iconResRef = spell.iconresref;
  }

  addSpellInstance(spellInstance: SpellCastInstance) {
    this.spellInstance = spellInstance;
  }

  /**
   * Select the attacker swing animation, mirroring the engine's selectors (swkotor2.exe
   * FUN_0076f300 melee / FUN_0076f940 ranged):
   *  - ACTIVE FORM swings play dedicated anims, identical across the form's tiers:
   *    Critical Strike {8,19,81} -> f{w}a1, Flurry {11,91} + Whirlwind {53} -> f{w}a2,
   *    Power Attack {28,17,83} -> f{w}a3, Force Jump {101,102,103} -> f{w}a4. K2 splits
   *    each melee form anim into 3 variants (f2a1a/b/c) picked rand()%3; K1 has single
   *    rows, so the bare name is a fallback candidate. Stun-baton wield (1) forms fall
   *    back to g1a1 (crit/power/jump) or g1a2 (flurry).
   *  - Ranged forms are fixed, unrandomized: Rapid family -> b{w}a2, Sniper -> b{w}a3,
   *    Power Blast -> b{w}a4; normal ranged -> b{w}a1.
   *  - Normal melee: vs S/L-model (monster) targets -> m{w}a1/2; synced duels (both sides
   *    melee-armed) -> c{w}a1..5 with a NON-REPEATING random variation; everything else ->
   *    g{w}a1..5 uniform random (K2 added g*a3-5; K1's shorter set is a fallback);
   *    stun baton alternates g1a1/g1a2; unarmed g8a1/2.
   * Unmodeled engine details (documented, low impact): feat 207 COMPLEX_UNARMED_ANIMS
   * unlocks the wield-10 unarmed set with level-gated duel variants; S/L-model ATTACKERS
   * use g0/m0 rows.
   */
  calculateAttackAnimation(){
    if(!BitWise.InstanceOfObject(this.owner, ModuleObjectType.ModuleCreature)) return;
    if(this.isCutsceneAttack){
      this.twoDAAnimation = OdysseyModelAnimation.GetAnimation2DA(this.animationName);
      return;
    }

    const owner: ModuleCreature = this.owner as any;
    const attackKey = owner.getCombatAnimationAttackType();
    const weaponWield = owner.getCombatAnimationWeaponType();
    const candidates: string[] = [];

    //---- active attack-form swings ----------------------------------------
    if(this.feat && attackKey == 'b'){
      let idx = 1;
      switch(this.feat.id){
        case CombatFeatType.RAPID_SHOT:
        case CombatFeatType.IMPROVED_RAPID_SHOT:
        case CombatFeatType.MASTER_RAPID_SHOT:
          idx = 2;
        break;
        case CombatFeatType.SNIPER_SHOT:
        case CombatFeatType.IMPROVED_SNIPER_SHOT:
        case CombatFeatType.MASTER_SNIPER_SHOT:
          idx = 3;
        break;
        case CombatFeatType.POWER_BLAST:
        case CombatFeatType.IMPROVED_POWER_BLAST:
        case CombatFeatType.MASTER_POWER_BLAST:
          idx = 4;
        break;
      }
      candidates.push('b' + weaponWield + 'a' + idx);
    }else if(this.feat && attackKey == 'm'){
      let idx = 0;
      switch(this.feat.id){
        case CombatFeatType.CRITICAL_STRIKE:
        case CombatFeatType.IMPROVED_CRITICAL_STRIKE:
        case CombatFeatType.MASTER_CRITICAL_STRIKE:
          idx = 1;
        break;
        case CombatFeatType.FLURRY:
        case CombatFeatType.IMPROVED_FLURRY:
        case CombatFeatType.MASTER_FLURRY: //53 = Whirlwind Attack, the K2 master-Flurry slot
          idx = 2;
        break;
        case CombatFeatType.POWER_ATTACK:
        case CombatFeatType.IMPROVED_POWER_ATTACK:
        case CombatFeatType.MASTER_POWER_ATTACK:
          idx = 3;
        break;
        case CombatFeatType.FORCE_JUMP:
        case CombatFeatType.FORCE_JUMP_ADVANCED:
        case CombatFeatType.FORCE_JUMP_MASTERY:
          idx = 4;
        break;
      }
      if(idx > 0){
        if(weaponWield == 1){
          //stun baton has no form anims — the engine falls back to the g1 swings
          candidates.push('g1a' + (idx == 2 ? 2 : 1));
        }else if(idx == 4){
          //Force Jump rows are single-variant (f2a4/f3a4/f4a4)
          candidates.push('f' + weaponWield + 'a4');
        }else{
          const base = 'f' + weaponWield + 'a' + idx;
          candidates.push(base + 'abc'[Math.floor(Math.random() * 3)]); //K2 3-variant rows
          candidates.push(base);                                       //K1 single row
        }
      }
    }

    //---- normal attacks ----------------------------------------------------
    if(!candidates.length){
      if(attackKey == 'b'){
        candidates.push('b' + weaponWield + 'a1');
      }else if(attackKey == 'g'){
        //unarmed: g8a1/g8a2 (feat 207's wield-10 set unmodeled)
        candidates.push('g' + weaponWield + 'a' + (Math.random() < 0.5 ? 1 : 2));
      }else{
        const target: ModuleCreature = this.target as any;
        const targetModelType = (BitWise.InstanceOfObject(this.target, ModuleObjectType.ModuleCreature) && target.creatureAppearance)
          ? target.creatureAppearance.modeltype : '';
        const killingBlow = !!(owner.combatRound && owner.combatRound.attacksIncludeKillingBlow());
        if(targetModelType == 'S' || targetModelType == 'L'){
          //monster-model targets get the m-series swings
          candidates.push('m' + weaponWield + 'a' + (Math.random() < 0.5 ? 1 : 2));
        }else if(weaponWield == 1){
          //stun baton alternates its two swings
          candidates.push('g1a' + (Math.random() < 0.5 ? 1 : 2));
        }else if(!killingBlow && BitWise.InstanceOfObject(this.target, ModuleObjectType.ModuleCreature) && owner.isDuelingObject(target)){
          //synced duel: c{w}a1..5 with a non-repeating random variation (engine FUN_0076f250
          //re-rolls while equal to the previous pick, remembered per creature)
          let variation = Math.floor(Math.random() * 5) + 1;
          const last = (owner as any)._duelAnimVariation;
          while(variation === last){
            variation = Math.floor(Math.random() * 5) + 1;
          }
          (owner as any)._duelAnimVariation = variation;
          candidates.push('c' + weaponWield + 'a' + variation);
        }else{
          //non-duel swings use the g-series (K2 g{w}a1..5; older data may only have a1/a2)
          candidates.push('g' + weaponWield + 'a' + (Math.floor(Math.random() * 5) + 1));
          candidates.push('g' + weaponWield + 'a' + (Math.random() < 0.5 ? 1 : 2));
        }
      }
    }

    //last-ditch fallbacks so a swing always resolves to SOMETHING
    candidates.push('c' + weaponWield + 'a1');
    candidates.push('g' + weaponWield + 'a1');

    for(const name of candidates){
      const anim = OdysseyModelAnimation.GetAnimation2DA(name);
      if(anim){
        this.animationName = name;
        this.twoDAAnimation = anim;
        return;
      }
    }
    this.animationName = candidates[0];
    this.twoDAAnimation = undefined;
  }

}