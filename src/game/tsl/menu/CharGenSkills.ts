import type { GUILabel, GUIButton, GUIListBox } from "@/gui";
import { CharGenSkills as K1_CharGenSkills } from "@/game/kotor/KOTOR";
import { GameState } from "@/GameState";

/**
 * CharGenSkills class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file CharGenSkills.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CharGenSkills extends K1_CharGenSkills {

  declare MAIN_TITLE_LBL: GUILabel;
  declare SUB_TITLE_LBL: GUILabel;
  declare SELECTIONS_REMAINING_LBL: GUILabel;
  declare COMPUTER_USE_POINTS_BTN: GUIButton;
  declare COMPUTER_USE_LBL: GUILabel;
  declare COM_MINUS_BTN: GUIButton;
  declare COM_PLUS_BTN: GUIButton;
  declare DEMOLITIONS_POINTS_BTN: GUIButton;
  declare DEMOLITIONS_LBL: GUILabel;
  declare DEM_PLUS_BTN: GUIButton;
  declare DEM_MINUS_BTN: GUIButton;
  declare STEALTH_POINTS_BTN: GUIButton;
  declare STEALTH_LBL: GUILabel;
  declare STE_MINUS_BTN: GUIButton;
  declare STE_PLUS_BTN: GUIButton;
  declare AWARENESS_POINTS_BTN: GUIButton;
  declare AWARENESS_LBL: GUILabel;
  declare AWA_MINUS_BTN: GUIButton;
  declare AWA_PLUS_BTN: GUIButton;
  declare PERSUADE_POINTS_BTN: GUIButton;
  declare PERSUADE_LBL: GUILabel;
  declare PER_MINUS_BTN: GUIButton;
  declare PER_PLUS_BTN: GUIButton;
  declare REPAIR_POINTS_BTN: GUIButton;
  declare REPAIR_LBL: GUILabel;
  declare REP_MINUS_BTN: GUIButton;
  declare REP_PLUS_BTN: GUIButton;
  declare COST_LBL: GUILabel;
  declare COST_POINTS_LBL: GUILabel;
  declare SECURITY_POINTS_BTN: GUIButton;
  declare SECURITY_LBL: GUILabel;
  declare SEC_MINUS_BTN: GUIButton;
  declare SEC_PLUS_BTN: GUIButton;
  declare TREAT_INJURY_POINTS_BTN: GUIButton;
  declare TREAT_INJURY_LBL: GUILabel;
  declare TRE_PLUS_BTN: GUIButton;
  declare TRE_MINUS_BTN: GUIButton;
  declare LB_DESC: GUIListBox;
  declare CLASSSKL_LBL: GUILabel;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare REMAINING_SELECTIONS_LBL: GUILabel;
  declare BTN_BACK: GUIButton;
  declare BTN_ACCEPT: GUIButton;
  declare BTN_RECOMMENDED: GUIButton;

  constructor(){
    super();
    this.gui_resref = 'skchrgen_p';
    this.background = '';
    this.voidFill = false;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {

      this.BTN_BACK.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });

      this.BTN_ACCEPT.addEventListener('click', (e) => {
        e.stopPropagation();
        const cg = GameState.CharGenManager;
        cg.selectedCreature.skills[0].rank = cg.computerUse;
        cg.selectedCreature.skills[1].rank = cg.demolitions;
        cg.selectedCreature.skills[2].rank = cg.stealth;
        cg.selectedCreature.skills[3].rank = cg.awareness;
        cg.selectedCreature.skills[4].rank = cg.persuade;
        cg.selectedCreature.skills[5].rank = cg.repair;
        cg.selectedCreature.skills[6].rank = cg.security;
        cg.selectedCreature.skills[7].rank = cg.treatInjury;
        this.close();
      });

      this.BTN_RECOMMENDED.addEventListener('click', (e) => {
        e.stopPropagation();
        const cg = GameState.CharGenManager;
        cg.resetSkillPoints();
        cg.availSkillPoints = cg.getMaxSkillPoints();
        const skillOrder = cg.getRecommendedOrder();
        const keys = ['computerUse','demolitions','stealth','awareness','persuade','repair','security','treatInjury'];
        while(cg.availSkillPoints > 0){
          for(let i = 0; i < 8; i++){
            if(!cg.availSkillPoints) break;
            const skillIndex = skillOrder[i];
            if(skillIndex >= 0){
              (cg as any)[keys[skillIndex]]++;
              cg.availSkillPoints -= 1;
            }
          }
        }
        this.updateButtonStates();
      });

      // Per-skill +/- buttons (never wired in the original): spend/refund the
      // available skill points. (Class-skill 2x cost and per-level max rank are a
      // follow-up; a flat max keeps a single skill from being dumped into.)
      const MAX_RANK = 4;
      const skills: Array<[GUIButton, GUIButton, string]> = [
        [this.COM_MINUS_BTN, this.COM_PLUS_BTN, 'computerUse'],
        [this.DEM_MINUS_BTN, this.DEM_PLUS_BTN, 'demolitions'],
        [this.STE_MINUS_BTN, this.STE_PLUS_BTN, 'stealth'],
        [this.AWA_MINUS_BTN, this.AWA_PLUS_BTN, 'awareness'],
        [this.PER_MINUS_BTN, this.PER_PLUS_BTN, 'persuade'],
        [this.REP_MINUS_BTN, this.REP_PLUS_BTN, 'repair'],
        [this.SEC_MINUS_BTN, this.SEC_PLUS_BTN, 'security'],
        [this.TRE_MINUS_BTN, this.TRE_PLUS_BTN, 'treatInjury'],
      ];
      for(const [minusBtn, plusBtn, key] of skills){
        plusBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const cg: any = GameState.CharGenManager;
          if(cg.availSkillPoints > 0 && cg[key] < MAX_RANK){
            cg[key]++;
            cg.availSkillPoints--;
            this.updateButtonStates();
          }
        });
        minusBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const cg: any = GameState.CharGenManager;
          if(cg[key] > 0){
            cg[key]--;
            cg.availSkillPoints++;
            this.updateButtonStates();
          }
        });
      }

      this.updateButtonStates();
      resolve();
    });
  }
  
}
