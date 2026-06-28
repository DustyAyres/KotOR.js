import { GFFDataType } from "@/enums/resource/GFFDataType";
import { GFFField } from "@/resource/GFFField";
import { GFFStruct } from "@/resource/GFFStruct";
import { TalentObject } from "@/talents/TalentObject";
import type { ModuleObject } from "@/module";
import { OdysseyModel3D } from "@/three/odyssey";
import { TwoDAManager } from "@/managers/TwoDAManager";
import { ActionType } from "@/enums/actions/ActionType";
import { ActionCombat } from "@/actions/ActionCombat";
import { CombatRoundAction, SpellCastInstance } from "@/combat";
import { ModuleCreatureAnimState } from "@/enums/module/ModuleCreatureAnimState";
import { CombatActionType } from "@/enums/combat/CombatActionType";
import { TalentObjectType } from "@/enums/engine/TalentObjectType";
import { TwoDAObject } from "@/resource/TwoDAObject";

const underscoreParser = (value: string = ''): number[] => {
  return value.split('_').map((val) => {
    return val != '' ? Number(val) : undefined; 
  }).filter((val) => typeof val !== 'undefined') || [];
}

export class TalentSpell extends TalentObject {
  flags: number;
  label: string = '';
  name: number = -1;
  spelldesc: number = -1;
  forcepoints: number = -1;

  /**
   * - = Neutral
   * G = Good
   * E = Evil
   */
  goodEvil: string = '-';

  /**
   * 1 = Spell
   * 2 = Special Ability
   * 3 = Feat
   * 4 = Item Power
   */
  userType: number = 0;
  prerequisites: number[] = [];
  masterspell: number = -1;
  guardian: number = 0;
  consular: number = 0;
  sentinel: number = 0;
  weaponmaster: number = 0;
  jedimaster: number = 0;
  watchman: number = 0;
  marauder: number = 0;
  sithlord: number = 0;
  assassin: number = 0;
  inate: number = 0;
  maxCR: number = -1;
  category: number = 0;
  range: string = '';
  iconresref: string = '';
  impactscript: string = '';
  conjtime: string = '0';
  conjanim: string = '';
  conjheadvisual: string = '';
  conjhandvisual: string = '';
  conjgrndvisual: string = '';
  conjsoundvfx: string = '';
  conjsoundmale: string = '';
  conjsoundfemale: string = '';
  castanim: string = 'self';
  casttime: number = 0;
  castheadvisual: string = '';
  casthandvisual: string = '';
  castgrndvisual: string = '';
  castsound: string = '';
  catchanim: string = '';
  catchheadvisual: string = '';
  catchhandvisual: string = '';
  catchgrndvisual: string = '';
  catchesound: string = '';
  catchtime: number = 0;
  proj: number = 0;
  projmodel: string = '';
  projtype: string = '';
  projspwnpoint: string = '';
  projsound: string = '';
  projorientation: string = '';
  immunitytype: string = '';
  itemimmunity: string = '';
  forcehostile: number = -1;
  forcefriendly: number = -1;
  forcepassive: number = -1;
  forcepriority: number = -1;
  dark_recom: number = -1;
  light_recom: number = -1;
  exclusion: number = 0;
  requireitemmask: number = 0;
  forbiditemmask: number = 0;
  pips: number = -1;
  itemtargeting: number = -1;
  hostilesetting: number = -1;
  formmask: number = 0;

  nextSpell: TalentSpell;

  constructor( id = 0 ){
    super(id);
    this.objectType = TalentObjectType.TalentObject | TalentObjectType.TalentSpell;

    const spells = TwoDAManager.datatables.get('spells');
    //Merge the spell properties from the spells.2da row with this spell
    if(spells && spells.rows[this.id]){
      this.parseTwoDARow(spells.rows[this.id]);
    }

  }

  setId( value = 0 ){
    this.id = value;
    //Merge the spell properties from the spells.2da row with this spell
    if(TwoDAManager.datatables.get('spells').rows[this.id]){
      Object.assign(this, TwoDAManager.datatables.get('spells').rows[this.id]);
    }
  }

  getConjureTime(){
    return this.conjtime;
  }

  getCastTime(){
    return this.casttime;
  }

  getCatchTime(){
    return this.catchtime;
  }

  /**
   * The CONJURE (wind-up) pose — a ONE-SHOT "castout" clip played for conjtime ms at the
   * start of a cast. Driven by the spells.2da `conjanim` pose-mode column.
   *
   * RE (swkotor2.exe FUN_006c1490 @ 0x6c2c02): conjanim/castanim are symbolic POSE MODES
   * (hand/self/up/throw/dark/...), NOT clip names. The real K2 animations.2da has only a
   * small cast clip set: castout1/2/3 (one-shot, fireforget=1) + castoutlp1/2/3 (looping
   * hold) + throwsab/throwsablp/throwgren/forcecrush. The wind-up uses the one-shot
   * castout*; the channel uses the looping castoutlp* (see getCastingAnimation). Verified
   * against the extracted K2 animations.2da (.planning/tmp/force-re).
   */
  getConjureAnimation(){
    switch(this.conjanim){
      case 'throw':
        // Lightsaber Throw (basic/advanced) -> saber throw, otherwise grenade. Preserved
        // verbatim; the throw powers are a separate (deferred) concern.
        return (this.id == 4 || this.id == 46) ? 'throwsab' : 'throwgren';
      case 'up':
        return 'castout3';   // both-arms-overhead wind-up (e.g. Death Field)
      default:
        return 'castout1';   // hand-forward wind-up ('hand' majority + fallbacks)
    }
  }

  /**
   * The CAST (channel/release) pose — the LOOPING "castout loop" clip held for casttime ms
   * while the power resolves. THIS IS THE FIX: it is driven by the spells.2da `castanim`
   * column. The old code branched on `conjanim` here and NEVER read `castanim`, so e.g.
   * Force Storm (conjanim=hand, castanim=up) channeled hand-forward instead of arms-overhead.
   *
   * Mode -> clip (RE: animations.2da has no dedicated per-mode clip, so the modes collapse
   * onto the small loop set):
   *   up            -> castoutlp3 (arms overhead: Force Storm, Death Field, Force Wave)
   *   crush         -> forcecrush (dedicated Force Crush clip)
   *   throw         -> throwsablp (lightsaber throw hold) / '' (grenade has no hold loop)
   *   self/dark/fury/jump/''/default -> castoutlp1 (hand-forward channel; covers Shock,
   *     Lightning and the buff/heal majority — no dedicated self/dark/fury clip exists)
   */
  getCastingAnimation(){
    switch(this.castanim){
      case 'throw':
        return (this.id == 4 || this.id == 46) ? 'throwsablp' : '';
      case 'up':
        return 'castoutlp3';
      case 'crush':
        return 'forcecrush';
      default:
        return 'castoutlp1';
    }
  }

  getCasterAnimation(){
    
  }

  getImpactAnimation(){
    
  }

  useTalentOnObject(oTarget: ModuleObject, oCaster: ModuleObject){
    super.useTalentOnObject(oTarget, oCaster);

    console.log('Talent.useTalentOnObject', this);
    
    oCaster.combatData.lastSpellTarget = oTarget;
    oTarget.combatData.lastSpellAttacker = oCaster;
    // Casting at a target puts the caster "in combat" the same way attacking does
    // (cf. ActionPhysicalAttacks.update -> owner.resetExcitedDuration(), called
    // unconditionally). Without this, combatData.combatState never flips true, updateCombat
    // drops the caster from READY to PAUSE so the player "just stands there" and the queued
    // cast stalls. Do it for any deliberate cast — not only hostilesetting == 1, which is
    // -1/absent for many TSL powers.
    oCaster.resetExcitedDuration();

    const combatAction = new CombatRoundAction(oCaster);
    combatAction.actionType = CombatActionType.CAST_SPELL;
    combatAction.target = oTarget;
    combatAction.setSpell(this);
    combatAction.animation = ModuleCreatureAnimState.CASTOUT1;
    combatAction.animationName = this.getConjureAnimation();
    combatAction.animationTime = 1500;

    combatAction.addSpellInstance(
      new SpellCastInstance(combatAction.owner, combatAction.target, this)
    );

    oCaster.combatRound.addAction(combatAction);

    if(!oCaster.actionQueue.actionTypeExists(ActionType.ActionCombat)){
      const action = new ActionCombat(0xFFFF);
      oCaster.actionQueue.add(action);
    }

  }

  inRange(oTarget: ModuleObject, oCaster: ModuleObject){
    if(oTarget == oCaster){
      return true;
    }
    let distance = oCaster.position.distanceTo(oTarget.position);
    //Spell ranges are defined in the ranges.2da file
    switch(this.range){
      case 'L': //Large
        return distance < 28;
      case 'M': //Medium
        return distance < 15;
      case 'P': //Personal
        return true;
      case 'S': //Small
        return distance < 10;
      case 'T': //Touch
        return true;//distance < 2.25;
      case 'W': //Throw
        return distance < 15;
    }
    return true;
  }

  getCastRange(){
    switch(this.range){
      case 'L': //Large
        return 28;
      case 'M': //Medium
        return 15;
      case 'P': //Personal
        return Infinity;
      case 'S': //Small
        return 10;
      case 'T': //Touch
        return Infinity;//distance < 2.25;
      case 'W': //Throw
        return 15;
    }
  }

  static From2DA( row: any ){
    const spell = new TalentSpell();
    spell.parseTwoDARow(row);
    return spell;
  }

  parseTwoDARow( row: any ){
    if (row.hasOwnProperty('__rowlabel'))
      this.id = TwoDAObject.normalizeValue(row.__rowlabel, 'number', 0);

    if (row.hasOwnProperty('label'))
      this.label = TwoDAObject.normalizeValue(row.label, 'string', '');

    if (row.hasOwnProperty('name'))
      this.name = TwoDAObject.normalizeValue(row.name, 'number', -1);

    if (row.hasOwnProperty('spelldesc'))
      this.spelldesc = TwoDAObject.normalizeValue(row.spelldesc, 'number', -1);

    if (row.hasOwnProperty('forcepoints'))
      this.forcepoints = TwoDAObject.normalizeValue(row.forcepoints, 'number', -1);

    if (row.hasOwnProperty('goodevil'))
      this.goodEvil = TwoDAObject.normalizeValue(row.goodevil, 'string', '-');

    if (row.hasOwnProperty('usertype'))
      this.userType = TwoDAObject.normalizeValue(row.usertype, 'number', 0);

    if (row.hasOwnProperty('prerequisites'))
      this.prerequisites = underscoreParser(TwoDAObject.normalizeValue(row.prerequisites, 'string', ''));

    if (row.hasOwnProperty('masterspell'))
      this.masterspell = TwoDAObject.normalizeValue(row.masterspell, 'number', -1);

    if (row.hasOwnProperty('guardian'))
      this.guardian = TwoDAObject.normalizeValue(row.guardian, 'number', 0);

    if (row.hasOwnProperty('consular'))
      this.consular = TwoDAObject.normalizeValue(row.consular, 'number', 0);

    if (row.hasOwnProperty('sentinel'))
      this.sentinel = TwoDAObject.normalizeValue(row.sentinel, 'number', 0);

    if (row.hasOwnProperty('weaponmaster'))
      this.weaponmaster = TwoDAObject.normalizeValue(row.weaponmaster, 'number', 0);

    if (row.hasOwnProperty('jedimaster'))
      this.jedimaster = TwoDAObject.normalizeValue(row.jedimaster, 'number', 0);

    if (row.hasOwnProperty('watchman'))
      this.watchman = TwoDAObject.normalizeValue(row.watchman, 'number', 0);

    if (row.hasOwnProperty('marauder'))
      this.marauder = TwoDAObject.normalizeValue(row.marauder, 'number', 0);

    if (row.hasOwnProperty('sithlord'))
      this.sithlord = TwoDAObject.normalizeValue(row.sithlord, 'number', 0);

    if (row.hasOwnProperty('assassin'))
      this.assassin = TwoDAObject.normalizeValue(row.assassin, 'number', 0);

    if (row.hasOwnProperty('inate'))
      this.inate = TwoDAObject.normalizeValue(row.inate, 'number', 0);

    if (row.hasOwnProperty('maxcr'))
      this.maxCR = TwoDAObject.normalizeValue(row.maxcr, 'number', -1);

    if (row.hasOwnProperty('category'))
      this.category = TwoDAObject.normalizeValue(row.category, 'number', 0);

    if (row.hasOwnProperty('range'))
      this.range = TwoDAObject.normalizeValue(row.range, 'string', '');

    if (row.hasOwnProperty('iconresref'))
      this.iconresref = TwoDAObject.normalizeValue(row.iconresref, 'string', '');

    if (row.hasOwnProperty('impactscript'))
      this.impactscript = TwoDAObject.normalizeValue(row.impactscript, 'string', '');

    if (row.hasOwnProperty('conjtime'))
      this.conjtime = TwoDAObject.normalizeValue(row.conjtime, 'number', 0);

    if (row.hasOwnProperty('conjanim'))
      this.conjanim = TwoDAObject.normalizeValue(row.conjanim, 'string', '');

    if (row.hasOwnProperty('conjheadvisual'))
      this.conjheadvisual = TwoDAObject.normalizeValue(row.conjheadvisual, 'string', '');

    if (row.hasOwnProperty('conjhandvisual'))
      this.conjhandvisual = TwoDAObject.normalizeValue(row.conjhandvisual, 'string', '');

    if (row.hasOwnProperty('conjgrndvisual'))
      this.conjgrndvisual = TwoDAObject.normalizeValue(row.conjgrndvisual, 'string', '');

    if (row.hasOwnProperty('conjsoundvfx'))
      this.conjsoundvfx = TwoDAObject.normalizeValue(row.conjsoundvfx, 'string', '');

    if (row.hasOwnProperty('conjsoundmale'))
      this.conjsoundmale = TwoDAObject.normalizeValue(row.conjsoundmale, 'string', '');

    if (row.hasOwnProperty('conjsoundfemale'))
      this.conjsoundfemale = TwoDAObject.normalizeValue(row.conjsoundfemale, 'string', '');

    if (row.hasOwnProperty('castanim'))
      this.castanim = TwoDAObject.normalizeValue(row.castanim, 'string', 'self');

    if (row.hasOwnProperty('casttime'))
      this.casttime = TwoDAObject.normalizeValue(row.casttime, 'number', 0);

    if (row.hasOwnProperty('castheadvisual'))
      this.castheadvisual = TwoDAObject.normalizeValue(row.castheadvisual, 'string', '');

    if (row.hasOwnProperty('casthandvisual'))
      this.casthandvisual = TwoDAObject.normalizeValue(row.casthandvisual, 'string', '');

    if (row.hasOwnProperty('castgrndvisual'))
      this.castgrndvisual = TwoDAObject.normalizeValue(row.castgrndvisual, 'string', '');

    if (row.hasOwnProperty('castsound'))
      this.castsound = TwoDAObject.normalizeValue(row.castsound, 'string', '');
    
    if (row.hasOwnProperty('catchtime'))
      this.catchtime = TwoDAObject.normalizeValue(row.catchtime, 'number', 0);

    if (row.hasOwnProperty('catchanim'))
      this.catchanim = TwoDAObject.normalizeValue(row.catchanim, 'string', '');

    if (row.hasOwnProperty('proj'))
      this.proj = TwoDAObject.normalizeValue(row.proj, 'number', 0);

    if (row.hasOwnProperty('projmodel'))
      this.projmodel = TwoDAObject.normalizeValue(row.projmodel, 'string', '');

    if (row.hasOwnProperty('projtype'))
      this.projtype = TwoDAObject.normalizeValue(row.projtype, 'string', '');
    
    if (row.hasOwnProperty('projspwnpoint'))
      this.projspwnpoint = TwoDAObject.normalizeValue(row.projspwnpoint, 'string', '');
    
    if (row.hasOwnProperty('projsound'))
      this.projsound = TwoDAObject.normalizeValue(row.projsound, 'string', '');

    if (row.hasOwnProperty('projorientation'))
      this.projorientation = TwoDAObject.normalizeValue(row.projorientation, 'string', '');

    if (row.hasOwnProperty('immunitytype'))
      this.immunitytype = TwoDAObject.normalizeValue(row.immunitytype, 'string', '');
    
    if (row.hasOwnProperty('itemimmunity'))
      this.itemimmunity = TwoDAObject.normalizeValue(row.itemimmunity, 'string', '');
    
    if (row.hasOwnProperty('forcehostile'))
      this.forcehostile = TwoDAObject.normalizeValue(row.forcehostile, 'number', -1);
    
    if (row.hasOwnProperty('forcefriendly'))
      this.forcefriendly = TwoDAObject.normalizeValue(row.forcefriendly, 'number', -1);
    
    if (row.hasOwnProperty('forcepassive'))
      this.forcepassive = TwoDAObject.normalizeValue(row.forcepassive, 'number', -1);
    
    if (row.hasOwnProperty('forcepriority'))
      this.forcepriority = TwoDAObject.normalizeValue(row.forcepriority, 'number', -1);
    
    if (row.hasOwnProperty('dark_recom'))
      this.dark_recom = TwoDAObject.normalizeValue(row.dark_recom, 'number', -1);
    
    if (row.hasOwnProperty('light_recom'))
      this.light_recom = TwoDAObject.normalizeValue(row.light_recom, 'number', -1);
    
    if (row.hasOwnProperty('exclusion'))
      this.exclusion = TwoDAObject.normalizeValue(row.exclusion, 'number', 0);
    
    if (row.hasOwnProperty('requireitemmask'))
      this.requireitemmask = TwoDAObject.normalizeValue(row.requireitemmask, 'number', 0);
    
    if (row.hasOwnProperty('forbiditemmask'))
      this.forbiditemmask = TwoDAObject.normalizeValue(row.forbiditemmask, 'number', 0);
    
    if (row.hasOwnProperty('pips'))
      this.pips = TwoDAObject.normalizeValue(row.pips, 'number', -1);
    
    if (row.hasOwnProperty('itemtargeting'))
      this.itemtargeting = TwoDAObject.normalizeValue(row.itemtargeting, 'number', -1);
    
    if (row.hasOwnProperty('hostilesetting'))
      this.hostilesetting = TwoDAObject.normalizeValue(row.hostilesetting, 'number', -1);

    if (row.hasOwnProperty('formmask'))
      this.formmask = TwoDAObject.normalizeValue(row.formmask, 'number', 0);
  }

  getFlags(){
    return 0;
  }

  getMetaMagic(){
    return this.metaMagic;
  }

  setFlags( flags = 0 ){
    this.flags = flags;
  }

  setMetaMagic( metaMagic = 0 ){
    this.metaMagic = metaMagic;
  }

  save(){
    let spellStruct = new GFFStruct(3);
    spellStruct.addField( new GFFField(GFFDataType.WORD, 'Spell') ).setValue(this.getId());
    //spellStruct.addField( new GFFField(GFFDataType.SHORT, 'SpellFlags') ).setValue(this.getFlags());
    //spellStruct.addField( new GFFField(GFFDataType.SHORT, 'SpellMetaMagic') ).setValue(this.getMetaMagic());
    return spellStruct;
  }

}
