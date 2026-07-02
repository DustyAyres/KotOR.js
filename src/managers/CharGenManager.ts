import { TwoDAManager } from "@/managers/TwoDAManager";
import { AudioLoader } from "@/audio/AudioLoader";
import { GameEngineType } from "@/enums/engine";
import { ModuleCreatureArmorSlot } from "@/enums/module/ModuleCreatureArmorSlot";
import { GFFDataType } from "@/enums/resource/GFFDataType";
import { getCharGenClasses } from "@/game/CharGenClasses";
import { GameState } from "@/GameState";
import { LBL_3DView } from "@/gui";
import type { ModulePlayer } from "@/module/ModulePlayer";
import { OdysseyModel } from "@/odyssey";
import { GFFField } from "@/resource/GFFField";
import { GFFObject } from "@/resource/GFFObject";
import { GFFStruct } from "@/resource/GFFStruct";
import { OdysseyModel3D } from "@/three/odyssey";
import { AudioEngine } from "@/audio/AudioEngine";
import { LTRObject } from "@/resource/LTRObject";
import { MDLLoader, ResourceLoader } from "@/loaders";
import { ResourceTypes } from "@/resource/ResourceTypes";
import { TalentFeat } from "@/talents";

/**
 * CharGenManager class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file CharGenManager.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CharGenManager {

  static availPoints = 30;
  static str = 8;
  static dex = 8;
  static con = 8;
  static wis = 8;
  static int = 8;
  static cha = 8;

  

  static availSkillPoints = 0;

  static computerUse = 0;
  static demolitions = 0;
  static stealth = 0;
  static awareness = 0;
  static persuade = 0;
  static repair = 0;
  static security = 0;
  static treatInjury = 0;


  static selectedClass: number = 0;
  static hoveredClass: number = 0;
  static selectedTemplate: GFFObject;
  static selectedCreature: ModulePlayer;
  static models: Map<number, OdysseyModel3D> = new Map();
  static templates: Map<number, GFFObject> = new Map();
  static creatures: Map<number, ModulePlayer> = new Map();
  static lbl_3d_views: Map<number, LBL_3DView> = new Map();

  static cgmain_light: OdysseyModel;
  static cgbody_light: OdysseyModel;
  static cghead_light: OdysseyModel;

  static step1_complete: boolean = false;
  static step2_complete: boolean = false;
  static step3_complete: boolean = false;
  static step4_complete: boolean = false;
  static step5_complete: boolean = false;
  static step6_complete: boolean = false;

  static ltrMaleName: LTRObject;
  static ltrFemaleName: LTRObject;
  static ltrLastName: LTRObject;

  static async Start(){
    await GameState.MenuManager.LoadScreen.setLoadBackground('load_chargen');
    GameState.MenuManager.LoadScreen.open();
    GameState.MenuManager.LoadScreen.setHintMessage('');
    await CharGenManager.StartBackgroundMusic();
    await CharGenManager.Init();
    await GameState.MenuManager.LoadCharGenGameMenus();
    await GameState.MenuManager.CharGenClass.Init();
    GameState.MenuManager.LoadScreen.close();
    GameState.MenuManager.CharGenClass.open();
  }

  static async StartBackgroundMusic(): Promise<void> {
    const audioResRef = GameState.GameKey == GameEngineType.KOTOR ? 'mus_theme_rep' : 'mus_a_main';
    const data = await AudioLoader.LoadMusic(audioResRef);
    AudioEngine.GetAudioEngine().setAudioBuffer('BACKGROUND_MUSIC_DAY', data.buffer as ArrayBuffer, audioResRef);
    AudioEngine.GetAudioEngine().areaMusicDayAudioEmitter.play();
  }

  static async Init(){
    CharGenManager.ltrMaleName = new LTRObject(await ResourceLoader.loadResource(ResourceTypes.ltr, 'humanm'));
    CharGenManager.ltrFemaleName = new LTRObject(await ResourceLoader.loadResource(ResourceTypes.ltr, 'humanf'));
    CharGenManager.ltrLastName = new LTRObject(await ResourceLoader.loadResource(ResourceTypes.ltr, 'humanl'));
    CharGenManager.InitializeCreatureTemplate();
    await CharGenManager.InitCharBackgroundModel();
  }

  static async InitCharBackgroundModel(): Promise<void> {
    await CharGenManager.LoadCGMainLight();
    await CharGenManager.LoadCGBodyLight();
    await CharGenManager.LoadCGHeadLight();
  }

  static async LoadCGMainLight(): Promise<void> {
    const mdl = await MDLLoader.loader.load('cgmain_light')
    CharGenManager.cgmain_light = mdl;
  }

  static async LoadCGBodyLight(): Promise<void> {
    const mdl = await MDLLoader.loader.load('cgbody_light')
    CharGenManager.cgbody_light = mdl;
  }

  static async LoadCGHeadLight(): Promise<void> {
    const mdl = await MDLLoader.loader.load('cghead_light')
    CharGenManager.cghead_light = mdl;
  }

  static InitializeCreatureTemplate(){
    for(let i = 0; i < 6; i++){
      CharGenManager.lbl_3d_views.set(i, new LBL_3DView());
      let template = CharGenManager.GetPlayerTemplate(i);
      CharGenManager.templates.set(i, template);
      CharGenManager.creatures.set(i, new GameState.Module.ModuleArea.ModulePlayer(template));
    }
    let template = CharGenManager.templates.get(CharGenManager.selectedClass);
    CharGenManager.selectedCreature = new GameState.Module.ModuleArea.ModulePlayer(template);
  }

  static GetPlayerTemplate(nth = 0) {
    let template = new GFFObject();
    // Class table is game-specific: K1 = Soldier/Scout/Scoundrel, TSL = the three
    // Jedi classes. The class id and appearance pool both come from the table so
    // the created PC is the class the slot advertises.
    const classDef = getCharGenClasses()[nth];
    let idx = Math.floor(Math.random() * classDef.appearances.length);
    let classId = classDef.id;
    let portraitId = 0;
    let appearanceIdx = classDef.appearances[idx];
    const portraits2DA = GameState.SWRuleSet.portraits;
    if(portraits2DA){
      for (let i = 0; i < portraits2DA.length; i++) {
        let port = portraits2DA[i];
        if (port.appearancenumber == appearanceIdx) {
          portraitId = i;
          break;
        } else if (port.appearance_l == appearanceIdx) {
          portraitId = i;
          break;
        } else if (port.appearance_s == appearanceIdx) {
          portraitId = i;
          break;
        }
      }
    }
    const gender = nth < 3 ? 0 : 1;
    template.RootNode.addField(new GFFField(GFFDataType.INT, 'AIState')).setValue(appearanceIdx);
    template.RootNode.addField(new GFFField(GFFDataType.LIST, 'ActionList'));
    template.RootNode.addField(new GFFField(GFFDataType.INT, 'Age')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'AmbientAnimState')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.INT, 'Animation')).setValue(10000);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Appearance_Head')).setValue(1);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'Appearance_Type')).setValue(appearanceIdx);
    template.RootNode.addField(new GFFField(GFFDataType.SHORT, 'ArmorClass')).setValue(10);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'BodyBag')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'FactionID')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'PortraitId')).setValue(portraitId);
    template.RootNode.addField(new GFFField(GFFDataType.CEXOLOCSTRING, 'FirstName')).setValue(CharGenManager.generateRandomName(gender));
    template.RootNode.addField(new GFFField(GFFDataType.CEXOLOCSTRING, 'LastName'));
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'HitPoints')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'CurrentHitPoints')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'MaxHitPoints')).setValue(20);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'ForcePoints')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.WORD, 'CurrentForce')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Gender')).setValue(gender);
    let equipment = template.RootNode.addField(new GFFField(GFFDataType.LIST, 'Equip_ItemList'));
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptAttacked')).setValue('k_hen_attacked01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptDamaged')).setValue('k_hen_damage01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptDeath')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptDialogue')).setValue('k_hen_dialogue01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptDisturbed')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptEndDialogu')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptEndRound')).setValue('k_hen_combend01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptHeartbeat')).setValue('k_hen_heartbt01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptOnBlocked')).setValue('k_hen_blocked01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptOnNotice')).setValue('k_hen_percept01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptRested')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptSpawn')).setValue('k_hen_spawn01');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptSpellAt')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.RESREF, 'ScriptUserDefine')).setValue('');
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'GoodEvil')).setValue(50);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'NaturalAC')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Con')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Dex')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Str')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Wis')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Cha')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Int')).setValue(8);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'fortbonus')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'refbonus')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'willbonus')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'PerceptionRange')).setValue(13);
    let skillList = template.RootNode.addField(new GFFField(GFFDataType.LIST, 'SkillList'));
    for (let i = 0; i < 8; i++) {
      let _skill = new GFFStruct();
      _skill.addField(new GFFField(GFFDataType.BYTE, 'Rank')).setValue(0);
      skillList.addChildStruct(_skill);
    }
    let classList = template.RootNode.addField(new GFFField(GFFDataType.LIST, 'ClassList'));
    let classStruct = new GFFStruct();
    classStruct.addField(new GFFField(GFFDataType.INT, 'Class')).setValue(classId);
    classStruct.addField(new GFFField(GFFDataType.SHORT, 'ClassLevel')).setValue(1);
    classStruct.addField(new GFFField(GFFDataType.LIST, 'KnownList0'));
    classList.addChildStruct(classStruct);
    let armorStruct = new GFFStruct(ModuleCreatureArmorSlot.ARMOR);
    armorStruct.addField(new GFFField(GFFDataType.RESREF, 'EquippedRes')).setValue('g_a_clothes01');
    equipment.addChildStruct(armorStruct);
    if (appearanceIdx >= 91 && appearanceIdx <= 105) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(83);
    } else if (appearanceIdx >= 106 && appearanceIdx <= 120) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(82);
    } else if (appearanceIdx >= 121 && appearanceIdx <= 135) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(83);
    } else if (appearanceIdx >= 136 && appearanceIdx <= 150) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(85);
    } else if (appearanceIdx >= 151 && appearanceIdx <= 165) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(84);
    } else if (appearanceIdx >= 166 && appearanceIdx <= 180) {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(85);
    } else {
      template.RootNode.addField(new GFFField(GFFDataType.WORD, 'SoundSetFile')).setValue(nth < 3 ? 85 : 83);
    }
    template.RootNode.addField(new GFFField(GFFDataType.BYTE, 'Race')).setValue(6);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'XPosition')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'YPosition')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'ZPosition')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'XOrientation')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'YOrientation')).setValue(0);
    template.RootNode.addField(new GFFField(GFFDataType.FLOAT, 'ZOrientation')).setValue(0);
    return template;
  }

  

  /**
   * Ability modifier (d20): floor((score - 10) / 2).
   */
  static abilityMod(score: number) {
    return Math.floor((score - 10) / 2);
  }

  /**
   * Compute and store the derived combat stats for a freshly created PC, BEFORE
   * the template is serialized (save()). The custom-creation path previously left
   * these as the placeholder template values (Max HP 20, saves 0, FP 0), so a
   * custom Jedi was cosmetically right but mechanically broken.
   *
   * - Max HP   = class hit die + CON modifier (KotOR takes the full hit die at L1,
   *              it does not roll). Stored on all three HP fields so the creature
   *              spawns at full health (getHP()/getMaxHP()).
   * - Saves    = class base save (by level, from cls_st_*) + ability modifier.
   *              The runtime save roll adds creature.fortitudeSaveThrow directly
   *              (NOT fortbonus), so the ability modifier must be baked in here.
   * - Force PP = class force pool (see getMaxForcePoints — formula flagged).
   *
   * Defense/AC is intentionally NOT written here: getAC() already derives it
   * (10 + DEX mod + class AC bonus + armor + effects) and save() serializes
   * getAC(), so AC is correct without a stored override.
   */
  static finalizeDerivedStats(creature: ModulePlayer) {
    if (!creature) return;
    const mainClass: any = creature.getMainClass();
    if (!mainClass) return;
    const level = creature.getTotalClassLevel() || 1;
    const mod = CharGenManager.abilityMod;

    // Max HP = hit die + CON modifier (minimum 1).
    const maxHP = Math.max(1, mainClass.hitdie + mod(creature.getCON()));
    creature.maxHitPoints = maxHP;
    creature.currentHitPoints = maxHP;
    creature.hitPoints = maxHP;

    // Saving throws store the CLASS BASE only (by level). The ability modifiers
    // (Fort↔CON, Ref↔DEX, Will↔WIS) are added at ROLL time by ModuleObject.fortitude/
    // reflex/willSave — baking them in here double-counted them for chargen PCs (UTC
    // creatures store base-only values), making the PC save too often (e.g. always
    // halving enemy Death Field).
    const st = Array.isArray(mainClass.savingThrows) ? mainClass.savingThrows[level - 1] : null;
    creature.fortitudeSaveThrow = (st ? st.fortsave : 0);
    creature.reflexSaveThrow    = (st ? st.refsave  : 0);
    creature.willSaveThrow      = (st ? st.willsave : 0);

    // Force Points.
    const maxFP = CharGenManager.getMaxForcePoints(creature, mainClass, level);
    creature.maxForcePoints = maxFP;
    creature.forcePoints = maxFP;

    // Auto-granted class feats (weapon proficiencies, Power Attack, Force Chain,
    // Jedi Defense, etc.). The Feats screen grants these when visited, but grant
    // them here too so a finalized PC always has them even if that step was skipped.
    CharGenManager.grantAutomaticFeats(creature);
  }

  /**
   * Grant the feats a PC of this class receives automatically at creation —
   * feat.2da <class>_pc_granted == 1 (e.g. jgd_pc_granted): the weapon
   * proficiencies, Power Attack/Power Blast/etc., Jedi Defense, Force Chain ...
   *
   * Note this is the PC-granted column, NOT the K1 status-3 `_granted` mechanism
   * (which the inherited CharGenFeats.addGrantedFeats uses): for the TSL Jedi
   * classes no feat has list-status 3, so the inherited path grants them nothing.
   * Some PC-granted feats (e.g. Force Chain) have list status 4 "unavailable to
   * pick", so this is intentionally NOT gated on isFeatAvailable. Idempotent.
   */
  static grantAutomaticFeats(creature: ModulePlayer) {
    const mainClass: any = creature.getMainClass();
    if (!mainClass || !mainClass.featstable) return;
    const pcGrantedKey = mainClass.featstable.toLowerCase() + 'PcGranted';
    const feats = GameState.SWRuleSet.feats;
    const count = GameState.SWRuleSet.featCount;
    for (let i = 0; i < count; i++) {
      const feat: any = feats[i];
      if (!feat || !feat.constant) continue; // skip blank placeholder rows
      if (parseInt(feat[pcGrantedKey]) === 1 && !creature.getHasFeat(i)) {
        // Index i is the feat id; new TalentFeat(id) carries it (From2DA does not).
        creature.addFeat(new TalentFeat(i));
      }
    }
  }

  /**
   * Level-1 Force Point pool.
   *
   * Confirmed from the swkotor2.exe dump (GetMaxForcePoints = FUN_0057eca0): each
   * Force-class level contributes `max(1, forcedie + WIS_modifier)`, then
   * BonusForcePoints (GFF) and conditional feat/item bonuses are added. Charisma
   * is NOT part of the formula (the common "WIS + CHA" guess is refuted by the
   * binary — only field 0xf6, the Wisdom modifier, feeds the pool). classes.2da
   * `forcedie` = Guardian 4 / Sentinel 6 / Consular 8. At creation BonusForcePoints
   * is 0, so L1 FP = max(1, forcedie + WIS mod).
   */
  static getMaxForcePoints(creature: ModulePlayer, mainClass: any, _level = 1) {
    const forcedie = mainClass.forcedie || 0;
    if (!forcedie) return 0; // non-Force class contributes nothing
    return Math.max(1, forcedie + CharGenManager.abilityMod(creature.getWIS()));
  }

  /**
   * When true, the CharGen skill helpers operate in level-up mode: they keep the creature's
   * EXISTING skill ranks (instead of zeroing them) and grant only this level's skill points.
   * Set by the level-up wizard (MenuLevelUp) and cleared when it closes.
   */
  static levelUpMode: boolean = false;

  static resetSkillPoints() {
    for (let i = 0; i < 8; i++) {
      // Level-up keeps current ranks as the floor; chargen starts from 0.
      if (!CharGenManager.levelUpMode) {
        CharGenManager.selectedCreature.skills[i].rank = 0;
      }
    }
    // Coerce to a number — stored ranks may be "" (GFF default) on an unmodified creature.
    const rank = (i: number) => parseInt(CharGenManager.selectedCreature.skills[i].rank as any) || 0;
    CharGenManager.computerUse = rank(0);
    CharGenManager.demolitions = rank(1);
    CharGenManager.stealth = rank(2);
    CharGenManager.awareness = rank(3);
    CharGenManager.persuade = rank(4);
    CharGenManager.repair = rank(5);
    CharGenManager.security = rank(6);
    CharGenManager.treatInjury = rank(7);
  }

  

  static getMaxSkillPoints() {
    const cre = CharGenManager.selectedCreature;
    const base = parseInt(cre.classes[0].skillpointbase as any) || 0;
    const intMod = CharGenManager.abilityMod(cre.getINT());
    // d20/KotOR (swkotor2.exe FUN_00846200): per-level points = max(1, skillpointbase + INT
    // modifier); the FIRST character level grants x4 that amount, later levels grant x1.
    const perLevel = Math.max(1, base + intMod);
    const totalLevel = cre.getTotalClassLevel() || 1;
    return (CharGenManager.levelUpMode || totalLevel > 1) ? perLevel : perLevel * 4;
  }

  /**
   * True if the indexed skill (0..7, matching the SkillList order) is a class
   * skill for the selected class, per skills.2da's <skillstable>_class flag.
   */
  static isClassSkill(skillIndex: number) {
    const skills2da = GameState.TwoDAManager.datatables.get('skills');
    const row = skills2da?.rows?.[skillIndex];
    if (!row) return false;
    return parseInt(row[CharGenManager.getSkillTableColumn()]) === 1;
  }

  /** Rank cost: class skill = 1 point/rank, cross-class = 2 points/rank. */
  static getSkillCost(skillIndex: number) {
    return CharGenManager.isClassSkill(skillIndex) ? 1 : 2;
  }

  /** Max rank: class skill = level + 3 (4 @ L1); cross-class = (level+3)/2 (2 @ L1). */
  static getSkillMaxRank(skillIndex: number) {
    const level = CharGenManager.selectedCreature?.getTotalClassLevel() || 1;
    return CharGenManager.isClassSkill(skillIndex) ? (level + 3) : Math.floor((level + 3) / 2);
  }

  static getSkillTableColumn() {
    return CharGenManager.selectedCreature.classes[0].skillstable.toLowerCase() + '_class';
  }

  static getSkillTableColumnRecommended() {
    return CharGenManager.selectedCreature.classes[0].skillstable.toLowerCase() + '_reco';
  }

  static getRecommendedOrder() {
    let skillOrder: any = {
      '0': -1,
      '1': -1,
      '2': -1,
      '3': -1,
      '4': -1,
      '5': -1,
      '6': -1,
      '7': -1
    };
    
    for (let i = 0; i < 8; i++) {
      let value = TwoDAManager.datatables.get('skills').rows[i][this.getSkillTableColumnRecommended()];
      if (value != '****') {
        skillOrder[value - 1] = i;
      }
    }
    return skillOrder;
  }

  static generateRandomName(gender: number = 0){
    const creature = CharGenManager.selectedCreature;
    if(creature && !gender){
      gender = creature.getGender();
    }

    let firstName = '';
    if(gender == 0){
      firstName = CharGenManager.ltrMaleName.getName();
    }else{
      firstName = CharGenManager.ltrFemaleName.getName();
    }
    
    return firstName + ' ' + CharGenManager.ltrLastName.getName();
  }

}