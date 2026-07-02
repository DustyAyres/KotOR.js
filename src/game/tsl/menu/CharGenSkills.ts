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
        // Spend in recommended priority order, honouring per-skill cost (class 1 /
        // cross-class 2) and the max-rank cap. Stop when a full pass raises nothing
        // (out of points or everything capped) so we never spin forever.
        let raisedAny = true;
        while(cg.availSkillPoints > 0 && raisedAny){
          raisedAny = false;
          for(let i = 0; i < 8; i++){
            const skillIndex = skillOrder[i];
            if(skillIndex < 0) continue;
            const cost = cg.getSkillCost(skillIndex);
            if(cg.availSkillPoints >= cost && (cg as any)[keys[skillIndex]] < cg.getSkillMaxRank(skillIndex)){
              (cg as any)[keys[skillIndex]]++;
              cg.availSkillPoints -= cost;
              raisedAny = true;
            }
          }
        }
        this.updateButtonStates();
      });

      // Per-skill +/- buttons (never wired in the original): spend/refund the
      // available skill points, honouring the d20 rules — class skills cost 1
      // point/rank and cap at level+3 (4 @ L1); cross-class skills cost 2 and cap
      // at (level+3)/2 (2 @ L1). The array order is the SkillList index (0..7),
      // which getSkillCost/getSkillMaxRank key off via skills.2da.
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
      skills.forEach(([minusBtn, plusBtn, key], skillIndex) => {
        plusBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const cg: any = GameState.CharGenManager;
          const cost = cg.getSkillCost(skillIndex);
          if(cg.availSkillPoints >= cost && cg[key] < cg.getSkillMaxRank(skillIndex)){
            cg[key]++;
            cg.availSkillPoints -= cost;
            this.updateButtonStates();
          }
        });
        minusBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const cg: any = GameState.CharGenManager;
          if(cg[key] > 0){
            cg[key]--;
            cg.availSkillPoints += cg.getSkillCost(skillIndex);
            this.updateButtonStates();
          }
        });
      });

      //Hovering a skill row selects it: cost, class/cross-class header and
      //description update (retail behavior)
      const rowPrefixes = ['COMPUTER_USE','DEMOLITIONS','STEALTH','AWARENESS','PERSUADE','REPAIR','SECURITY','TREAT_INJURY'];
      rowPrefixes.forEach((prefix, skillIndex) => {
        for(const name of [`${prefix}_LBL`, `${prefix}_POINTS_BTN`]){
          this.getControlByName(name)?.addEventListener('hover', () => {
            this.updateSkillSelection(skillIndex);
          });
        }
      });

      this.updateButtonStates();
      resolve();
    });
  }

  selectedSkill: number = 0;

  updateSkillSelection(skillIndex: number){
    this.selectedSkill = skillIndex;
    const cg: any = GameState.CharGenManager;
    const cost = cg.getSkillCost(skillIndex);
    this.COST_POINTS_LBL.setText(cost.toString());
    this.CLASSSKL_LBL.setText(cost > 1 ? 'Cross-Class Skill' : 'Class Skill');

    const row: any = GameState.TwoDAManager.datatables.get('skills')?.rows[skillIndex];
    if(row){
      const attrNames: {[key: string]: string} = {
        STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
        INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
      };
      const related = attrNames[(row.keyability ?? '').toUpperCase()] ?? row.keyability ?? '';
      const desc = GameState.TLKManager.TLKStrings[parseInt(row.description)]?.Value ?? '';
      this.LB_DESC.setItem(`Related Attribute: ${related}\n\n${desc}`);
    }
  }

  updateButtonStates(){
    super.updateButtonStates();
    const cg: any = GameState.CharGenManager;
    const rows: Array<[GUIButton, GUIButton, string]> = [
      [this.COM_MINUS_BTN, this.COM_PLUS_BTN, 'computerUse'],
      [this.DEM_MINUS_BTN, this.DEM_PLUS_BTN, 'demolitions'],
      [this.STE_MINUS_BTN, this.STE_PLUS_BTN, 'stealth'],
      [this.AWA_MINUS_BTN, this.AWA_PLUS_BTN, 'awareness'],
      [this.PER_MINUS_BTN, this.PER_PLUS_BTN, 'persuade'],
      [this.REP_MINUS_BTN, this.REP_PLUS_BTN, 'repair'],
      [this.SEC_MINUS_BTN, this.SEC_PLUS_BTN, 'security'],
      [this.TRE_MINUS_BTN, this.TRE_PLUS_BTN, 'treatInjury'],
    ];
    //Retail hides - at rank 0 and + when unaffordable/at the rank cap
    rows.forEach(([minusBtn, plusBtn, key], skillIndex) => {
      if(!minusBtn || !plusBtn){ return; }
      if((cg[key] ?? 0) <= 0){ minusBtn.hide(); }else{ minusBtn.show(); }
      if(cg.getSkillCost(skillIndex) > cg.availSkillPoints || cg[key] >= cg.getSkillMaxRank(skillIndex)){
        plusBtn.hide();
      }else{
        plusBtn.show();
      }
    });
    this.COST_POINTS_LBL.setText(cg.getSkillCost(this.selectedSkill).toString());
  }

  show(){
    super.show();
    //Retail opens with the first skill selected (header/cost/description populated)
    this.updateSkillSelection(0);
    this.updateButtonStates();
  }

}
