import { GameState } from "@/GameState";
import type { GUIButton, GUIControl, GUILabel } from "@/gui";
import type { ModuleCreature } from "@/module";
import { MenuLevelUp as K1_MenuLevelUp } from "@/game/kotor/KOTOR";

/**
 * MenuLevelUp class.
 *
 * The TSL manual level-up wizard (GUI `leveluppnl_p`). It mirrors the engine's
 * CSWGuiLevelUpPanel (swkotor2.exe FUN_00902f60): an ordered list of steps, each gated by a
 * condition, that reuse the same CharGen sub-panels as character creation —
 *   1 Attributes (ability +1, only when the NEW total level % 4 == 0)
 *   2 Skills     (always — grants this level's skill points)
 *   3 Feats      (when featgain _REG + _BON > 0 for the class/level)
 *   4 Powers     (Force classes only, when powergain > 0)
 *   5 Accept     (commit)
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file MenuLevelUp.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuLevelUp extends K1_MenuLevelUp {

  declare BTN_BACK: GUIButton;
  declare LBL_5: GUIControl;
  declare LBL_4: GUIControl;
  declare LBL_3: GUIControl;
  declare LBL_2: GUIControl;
  declare LBL_1: GUIControl;
  declare LBL_NUM1: GUILabel;
  declare LBL_NUM2: GUILabel;
  declare LBL_NUM3: GUILabel;
  declare LBL_NUM4: GUILabel;
  declare LBL_NUM5: GUILabel;
  declare BTN_STEPNAME4: GUIButton;
  declare BTN_STEPNAME1: GUIButton;
  declare BTN_STEPNAME2: GUIButton;
  declare BTN_STEPNAME3: GUIButton;
  declare BTN_STEPNAME5: GUIButton;

  /** The creature currently being levelled. */
  creature: ModuleCreature;
  /** The class index (in creature.classes) gaining the level. */
  levelClassIndex: number = 0;
  /** Per-step applicability for THIS level-up. */
  steps = { attributes: false, skills: false, feats: false, powers: false };
  /** Per-step completion. */
  done = { attributes: false, skills: false, feats: false, powers: false };
  /** Snapshot of creature state captured at wizard start, for cancel. */
  private snapshot: any = null;

  constructor(){
    super();
    this.gui_resref = 'leveluppnl_p';
    this.background = '';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {

      this.BTN_BACK.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancel();
      });
      this._button_b = this.BTN_BACK;

      this.BTN_STEPNAME1.addEventListener('click', (e) => {
        e.stopPropagation();
        if(this.steps.attributes) this.openAttributesStep();
      });

      this.BTN_STEPNAME2.addEventListener('click', (e) => {
        e.stopPropagation();
        if(this.steps.skills) this.openSkillsStep();
      });

      this.BTN_STEPNAME3.addEventListener('click', (e) => {
        e.stopPropagation();
        if(this.steps.feats) this.openFeatsStep();
      });

      this.BTN_STEPNAME4.addEventListener('click', (e) => {
        e.stopPropagation();
        if(this.steps.powers) this.openPowersStep();
      });

      this.BTN_STEPNAME5.addEventListener('click', (e) => {
        e.stopPropagation();
        this.accept();
      });

      resolve();
    });
  }

  /**
   * Begin a manual level-up for the given creature. Loads the CharGen sub-menus if needed
   * (they aren't loaded during normal gameplay), captures a snapshot for cancel, increments
   * the class level so all level-aware step math (skill max-rank, etc.) uses the NEW level,
   * then opens the step panel.
   */
  async startLevelUp(creature: ModuleCreature){
    if(!creature || !creature.canLevelUp()) return;
    // Ensure the CharGen sub-panels exist (loaded only during creation otherwise). Use the
    // level-up-specific loader, which skips CharGenMain (its 3D init isn't needed here).
    if(!this.manager.CharGenSkills){
      await this.manager.LoadLevelUpGameMenus();
    }
    this.creature = creature;
    this.levelClassIndex = this.getMainClassIndex(creature);
    this.captureSnapshot();

    // Increment the levelled class so getTotalClassLevel() reflects the NEW level for all
    // step computations (skill max rank = level+3, etc.). The HP/FP gains are applied on
    // Accept; on Cancel the snapshot restores the old level.
    creature.classes[this.levelClassIndex].level += 1;

    this.computeSteps();
    this.done = { attributes: false, skills: false, feats: false, powers: false };

    GameState.CharGenManager.levelUpMode = true;
    GameState.CharGenManager.selectedCreature = creature as any;

    this.open();
  }

  getMainClassIndex(creature: ModuleCreature){
    const main = creature.getMainClass();
    const idx = creature.classes.indexOf(main as any);
    return idx >= 0 ? idx : 0;
  }

  /** Determine which steps apply for the (already-incremented) new level. */
  computeSteps(){
    const creature = this.creature;
    const newLevel = creature.getTotalClassLevel();
    this.steps.attributes = (newLevel % 4) === 0;        // +1 ability every 4th level
    this.steps.skills = true;                             // skill points granted every level
    this.steps.feats = this.getFeatGrantCount() > 0;
    this.steps.powers = this.getPowerGrantCount() > 0;
  }

  /** Number of feats the player may pick this level: featgain.2da <class>_REG + _BON (direct row). */
  getFeatGrantCount(){
    const cls: any = this.creature.classes[this.levelClassIndex];
    if(!cls) return 0;
    const classLevel = cls.level; // already the new level
    const tbl = GameState.TwoDAManager.datatables.get('featgain');
    if(!tbl) return 0;
    const row = tbl.rows[classLevel - 1];
    if(!row) return 0;
    const key = (cls.featgain || 'SOL').toString().toLowerCase();
    const reg = parseInt(row[key + '_reg']);
    const bon = parseInt(row[key + '_bon']);
    return (isNaN(reg) ? 0 : reg) + (isNaN(bon) ? 0 : bon);
  }

  /** Number of force powers the player may pick this level (Force classes only). */
  getPowerGrantCount(){
    const cls: any = this.creature.classes[this.levelClassIndex];
    if(!cls || !(cls.forcedie > 0)) return 0; // non-Force classes never gain powers
    // CreatureClass parses ClassPowerGain into spellGainPoints[] (per-level, row = level-1).
    const v = (cls.spellGainPoints || [])[cls.level - 1];
    return (typeof v === 'number' && v > 0) ? v : 0;
  }

  show() {
    super.show();
    this.updateStepPanel();
  }

  /** Render the 5-step panel: label each step, disable inapplicable/locked ones, show progress. */
  updateStepPanel(){
    const cfg: Array<[GUIButton, GUILabel, boolean]> = [
      [this.BTN_STEPNAME1, this.LBL_NUM1, this.steps.attributes],
      [this.BTN_STEPNAME2, this.LBL_NUM2, this.steps.skills],
      [this.BTN_STEPNAME3, this.LBL_NUM3, this.steps.feats],
      [this.BTN_STEPNAME4, this.LBL_NUM4, this.steps.powers],
      [this.BTN_STEPNAME5, this.LBL_NUM5, true], // Accept always available once required steps done
    ];
    for(const [btn, , applicable] of cfg){
      if(!btn) continue;
      if(applicable){ btn.show?.(); } else { btn.hide?.(); }
    }
    // Accept is enabled only when every applicable step is complete.
    const ready = (!this.steps.attributes || this.done.attributes)
      && (!this.steps.skills || this.done.skills)
      && (!this.steps.feats || this.done.feats)
      && (!this.steps.powers || this.done.powers);
    if(ready){ this.BTN_STEPNAME5?.show?.(); } else { this.BTN_STEPNAME5?.hide?.(); }
  }

  // ---- Steps -------------------------------------------------------------

  openSkillsStep(){
    const cg = GameState.CharGenManager;
    cg.levelUpMode = true;
    cg.selectedCreature = this.creature as any;
    // Seed working state from current ranks; grant only this level's points.
    cg.resetSkillPoints();
    cg.availSkillPoints = cg.getMaxSkillPoints();
    this.done.skills = true; // visiting the step satisfies it (0 leftover points is allowed)
    this.manager.CharGenSkills.open();
  }

  openFeatsStep(){
    const cg = GameState.CharGenManager;
    cg.levelUpMode = true;
    cg.selectedCreature = this.creature as any;
    // CharGenFeats.show() reads featGainPoints[newLevel-1] for the selectable count, auto-grants
    // this level's class feats, and adds picks to the creature — exactly what level-up needs.
    this.done.feats = true;
    this.manager.CharGenFeats.open();
  }

  openAttributesStep(){
    // Wired in a later slice (+1 ability picker). Placeholder: mark done.
    this.done.attributes = true;
    this.updateStepPanel();
  }

  openPowersStep(){
    // Wired in a later slice (force-power picker). Placeholder: mark done.
    this.done.powers = true;
    this.updateStepPanel();
  }

  // ---- Commit / cancel ---------------------------------------------------

  /** Commit the level: apply HP/FP gains (skills/feats/etc. already written by their steps). */
  accept(){
    if(!this.creature) { this.close(); return; }
    const cls = this.creature.classes[this.levelClassIndex];
    // Skills/feats/abilities/powers were applied by their step screens; the class level was
    // already incremented at startLevelUp. Apply the HP/FP gains for this level.
    (this.creature as any).applyLevelHPFP(cls);
    this.snapshot = null;
    GameState.CharGenManager.levelUpMode = false;
    this.close();
  }

  /** Abort the level-up and restore the creature to its pre-wizard state. */
  cancel(){
    this.restoreSnapshot();
    GameState.CharGenManager.levelUpMode = false;
    this.close();
  }

  private captureSnapshot(){
    const c: any = this.creature;
    this.snapshot = {
      classLevels: c.classes.map((cl: any) => cl.level),
      skills: c.skills.map((s: any) => s.rank),
      feats: c.feats ? c.feats.slice() : [],
      str: c.str, dex: c.dex, con: c.con, int: c.int, wis: c.wis, cha: c.cha,
      hitPoints: c.hitPoints, maxHitPoints: c.maxHitPoints, currentHitPoints: c.currentHitPoints,
      forcePoints: c.forcePoints, maxForcePoints: c.maxForcePoints,
    };
  }

  private restoreSnapshot(){
    if(!this.snapshot) return;
    const c: any = this.creature;
    this.snapshot.classLevels.forEach((lvl: number, i: number) => { if(c.classes[i]) c.classes[i].level = lvl; });
    this.snapshot.skills.forEach((rank: number, i: number) => { if(c.skills[i]) c.skills[i].rank = rank; });
    c.feats = this.snapshot.feats;
    c.str = this.snapshot.str; c.dex = this.snapshot.dex; c.con = this.snapshot.con;
    c.int = this.snapshot.int; c.wis = this.snapshot.wis; c.cha = this.snapshot.cha;
    c.hitPoints = this.snapshot.hitPoints; c.maxHitPoints = this.snapshot.maxHitPoints;
    c.currentHitPoints = this.snapshot.currentHitPoints;
    c.forcePoints = this.snapshot.forcePoints; c.maxForcePoints = this.snapshot.maxForcePoints;
    this.snapshot = null;
  }

}
