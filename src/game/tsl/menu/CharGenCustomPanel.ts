import type { GUIControl, GUILabel, GUIButton } from "@/gui";
import { CharGenCustomPanel as K1_CharGenCustomPanel } from "@/game/kotor/KOTOR";
import { GameState } from "@/GameState";
import { CurrentGame } from "@/engine/CurrentGame";

/**
 * CharGenCustomPanel class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file CharGenCustomPanel.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CharGenCustomPanel extends K1_CharGenCustomPanel {

  declare LBL_6: GUIControl;
  declare LBL_5: GUIControl;
  declare LBL_4: GUIControl;
  declare LBL_3: GUIControl;
  declare LBL_2: GUIControl;
  declare LBL_1: GUIControl;
  declare BTN_STEPNAME1: GUIButton;
  declare LBL_NUM1: GUILabel;
  declare BTN_STEPNAME2: GUIButton;
  declare LBL_NUM2: GUILabel;
  declare BTN_STEPNAME3: GUIButton;
  declare LBL_NUM3: GUILabel;
  declare BTN_STEPNAME4: GUIButton;
  declare LBL_NUM4: GUILabel;
  declare BTN_STEPNAME5: GUIButton;
  declare LBL_NUM5: GUILabel;
  declare BTN_STEPNAME6: GUIButton;
  declare LBL_NUM6: GUILabel;
  declare BTN_BACK: GUIButton;
  declare BTN_CANCEL: GUIButton;

  constructor(){
    super();
    this.gui_resref = 'custpnl_p';
    this.background = '';
    this.voidFill = false;
  }
  
  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {
      this.BTN_BACK.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenMain.close();
        this.manager.CharGenMain.childMenu = this.manager.CharGenQuickOrCustom;
        this.manager.CharGenMain.open();
      });

      // Step 1: Portrait
      this.BTN_STEPNAME1.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenPortCust.open();
      });

      // Step 2: Attributes / ability scores (the stat selection screen).
      // Use the chargen selectedCreature, not getCurrentPlayer() — during
      // character creation there is no party yet, so getCurrentPlayer() is
      // undefined and the point-buy (gated on this.creature) would be inert.
      this.BTN_STEPNAME2.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenAbilities.setCreature(GameState.CharGenManager.selectedCreature);
        this.manager.CharGenAbilities.open();
      });

      // Step 3: Skills
      this.BTN_STEPNAME3.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenSkills.open();
      });

      // Step 4: Feats
      this.BTN_STEPNAME4.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenFeats.open();
      });

      // Step 5: Name
      this.BTN_STEPNAME5.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.CharGenName.open();
      });

      // Step 6: Play (finalize the character and start the game) — mirrors the
      // proven TSL quick-panel finalization, loading the TSL start module.
      this.BTN_STEPNAME6.addEventListener('click', (e) => {
        e.stopPropagation();
        const creature = GameState.CharGenManager.selectedCreature;
        // The chosen name lives on creature.firstName, but save() reads the
        // template's FirstName field — sync it across or the typed name is lost.
        const firstNameField = creature.template.getFieldByLabel('FirstName');
        if(firstNameField) firstNameField.setValue(creature.firstName || '');
        creature.equipment.ARMOR = undefined;
        creature.template.getFieldByLabel('Equip_ItemList').childStructs = [];
        GameState.GlobalVariableManager.Init();
        GameState.PartyManager.PlayerTemplate = GameState.CharGenManager.selectedCreature.save();
        GameState.PartyManager.ActualPlayerTemplate = GameState.PartyManager.PlayerTemplate;
        GameState.PartyManager.AddPortraitToOrder(GameState.CharGenManager.selectedCreature.getPortraitResRef());
        CurrentGame.InitGameInProgressFolder(true).then( () => {
          GameState.LoadModule('001EBO');
        });
      });

      resolve();
    });
  }
  
}
