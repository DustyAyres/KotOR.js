import type { GUIListBox, GUILabel, GUIButton } from "@/gui";
import { CharGenFeats as K1_CharGenFeats } from "@/game/kotor/KOTOR";
import { GameState } from "@/GameState";
import { TalentFeat } from "@/talents";

/**
 * CharGenFeats class.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file CharGenFeats.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CharGenFeats extends K1_CharGenFeats {

  declare MAIN_TITLE_LBL: GUILabel;
  declare SUB_TITLE_LBL: GUILabel;
  declare STD_SELECTIONS_REMAINING_LBL: GUILabel;
  declare STD_REMAINING_SELECTIONS_LBL: GUILabel;
  declare LB_DESC: GUIListBox;
  declare LBL_NAME: GUILabel;
  declare BTN_SELECT: GUIButton;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare BTN_BACK: GUIButton;
  declare BTN_ACCEPT: GUIButton;
  declare BTN_RECOMMENDED: GUIButton;
  declare LB_FEATS: GUIListBox;

  /** Feats the player may still pick at this level (class-granted feats don't count). */
  remainingFeats: number = 0;
  /** The feat highlighted in the list that BTN_SELECT would grant. */
  selectedFeat: TalentFeat | null = null;

  constructor(){
    super();
    this.gui_resref = 'ftchrgen_p';
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

      // Feats are added to the creature as they're selected, so accept just closes.
      this.BTN_ACCEPT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });

      this.BTN_SELECT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectHighlightedFeat();
      });

      this.BTN_RECOMMENDED.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectRecommended();
      });

      // Selecting a row in the feat list highlights the grantable feat in that
      // chain and shows its name/description.
      this.LB_FEATS.onSelected = (node: any) => {
        this.onFeatHighlight(node);
      };

      resolve();
    });
  }

  show() {
    // The shared feat widgets (GUIFeatItem) and feat queries read
    // GameState.getCurrentPlayer(); during chargen there is no party yet, so point
    // it at the in-progress creature or the list build throws / renders empty.
    GameState.PartyManager.Player = GameState.CharGenManager.selectedCreature;
    this.creature = GameState.CharGenManager.selectedCreature;

    // Number of selectable feats at the current (creation) level.
    const mainClass: any = this.creature.getMainClass();
    const level = this.creature.getTotalClassLevel();
    let avail = 1;
    if(mainClass && Array.isArray(mainClass.featGainPoints) && typeof mainClass.featGainPoints[level - 1] === 'number'){
      avail = mainClass.featGainPoints[level - 1];
    }
    this.remainingFeats = Math.max(0, avail);
    this.selectedFeat = null;

    super.show(); // addGrantedFeats() + LB_FEATS proto + buildFeatList()
    this.updateRemaining();

    //Retail opens with the first feat chain highlighted (name + description populated)
    const firstNode: any = (this.LB_FEATS as any).children?.[0]?.node;
    if(firstNode){ this.onFeatHighlight(firstNode); }
  }

  /** Highlight handler: pick the lowest tier in the chain the creature can still take. */
  onFeatHighlight(node: any){
    this.selectedFeat = null;
    if(Array.isArray(node)){
      for(const feat of node){
        if(feat && !this.creature.getHasFeat(feat.id)){
          this.selectedFeat = feat;
          break;
        }
      }
      const display = this.selectedFeat || node[0];
      if(display){
        if(this.LBL_NAME) this.LBL_NAME.setText(this.getFeatName(display));
        //GUIListBox has no setText — setItem is the single-content API
        if(this.LB_DESC) this.LB_DESC.setItem(this.getFeatDescription(display));
      }
    }
  }

  /** Grant the highlighted feat to the creature, spending one selection. */
  selectHighlightedFeat(){
    if(this.remainingFeats <= 0) return;
    const feat = this.selectedFeat;
    if(!feat) return;
    if(this.creature.getHasFeat(feat.id)) return;
    this.creature.addFeat(new TalentFeat(feat.id));
    this.remainingFeats--;
    this.selectedFeat = null;
    this.buildFeatList();
    this.updateRemaining();
  }

  /** Auto-spend remaining selections on the first grantable feats in the list. */
  selectRecommended(){
    // GUIListBox stores its data nodes in `listItems` (not `.items`).
    const groups: any[] = (this.LB_FEATS as any).listItems || [];
    for(const group of groups){
      if(this.remainingFeats <= 0) break;
      if(!Array.isArray(group)) continue;
      for(const feat of group){
        if(this.remainingFeats <= 0) break;
        if(feat && !this.creature.getHasFeat(feat.id)){
          this.creature.addFeat(new TalentFeat(feat.id));
          this.remainingFeats--;
          break; // one feat per chain
        }
      }
    }
    this.buildFeatList();
    this.updateRemaining();
  }

  updateRemaining(){
    if(this.STD_REMAINING_SELECTIONS_LBL && typeof (this.STD_REMAINING_SELECTIONS_LBL as any).setText === 'function'){
      this.STD_REMAINING_SELECTIONS_LBL.setText(String(this.remainingFeats));
    }
  }

  protected getFeatName(feat: any): string {
    try {
      const s = GameState.TLKManager.TLKStrings[feat.name];
      return (s && s.Value) || feat.label || '';
    } catch(e){ return feat.label || ''; }
  }

  protected getFeatDescription(feat: any): string {
    try {
      const s = GameState.TLKManager.TLKStrings[feat.description];
      return (s && s.Value) || '';
    } catch(e){ return ''; }
  }

}
