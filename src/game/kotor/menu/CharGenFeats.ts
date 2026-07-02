import { GameMenu } from "@/gui";
import type { GUIListBox, GUILabel, GUIButton } from "@/gui";
import { GUIFeatItem } from "@/game/kotor/gui/GUIFeatItem";
import type { ModuleCreature } from "@/module";
import { TalentFeat } from "@/talents";
import { GameState } from "@/GameState";

/**
 * CharGenFeats class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file CharGenFeats.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CharGenFeats extends GameMenu {

  MAIN_TITLE_LBL: GUILabel;
  SUB_TITLE_LBL: GUILabel;
  DESC_LBL: GUILabel;
  STD_SELECTIONS_REMAINING_LBL: GUILabel;
  STD_REMAINING_SELECTIONS_LBL: GUILabel;
  LB_FEATS: GUIListBox;
  LB_DESC: GUIListBox;
  LBL_NAME: GUILabel;
  BTN_RECOMMENDED: GUIButton;
  BTN_SELECT: GUIButton;
  BTN_ACCEPT: GUIButton;
  BTN_BACK: GUIButton;

  creature: ModuleCreature;

  /** Feats the player may still pick at this level (class-granted feats don't count). */
  remainingFeats: number = 0;
  /** The feat highlighted in the list that BTN_SELECT would grant. */
  selectedFeat: TalentFeat | null = null;

  constructor(){
    super();
    this.gui_resref = 'ftchrgen';
    this.background = '1600x1200back';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer();
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

      this.LB_FEATS.onSelected = (node: any) => {
        this.onFeatHighlight(node);
      };

      resolve();
    });
  }

  show() {
    // The shared feat widgets (GUIFeatItem) and feat queries read getCurrentPlayer();
    // during chargen there is no party yet, so point it at the in-progress creature or
    // the granted-feats/list build short-circuits on `if(this.creature)` and renders empty.
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

    super.show();
    this.addGrantedFeats();
    this.LB_FEATS.setProtoBuilder(GUIFeatItem);
    this.buildFeatList();
    this.updateRemaining();
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

  /** Auto-spend remaining selections on the first grantable feat in each chain. */
  selectRecommended(){
    // GUIListBox stores its data nodes in `listItems` (setItems -> listItems);
    // there is no `.items`, so reading that gave an empty list and Recommended no-op'd.
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

  setCreature(creature: ModuleCreature){
    this.creature = creature;
  }

  addGrantedFeats() {
    const featCount = GameState.SWRuleSet.featCount;
    let granted = [];
    for (let i = 0; i < featCount; i++) {
      const feat = GameState.SWRuleSet.feats[i];
      if(this.creature){
        const mainClass = this.creature.getMainClass();
        if (mainClass && feat.constant != '****') {
          if (mainClass.isFeatAvailable(feat)) {
            const status = mainClass.getFeatStatus(feat);
            if (status == 3 && this.creature.getTotalClassLevel() >= mainClass.getFeatGrantedLevel(feat)) {
              if (!this.creature.getHasFeat(i)) {
                console.log('Feat Granted', feat);
                this.creature.addFeat(TalentFeat.From2DA(feat));
                granted.push(feat);
              }
            }
          }
        }
      }
    }
  }

  buildFeatList() {
    const feats = GameState.SWRuleSet.feats;
    const featCount = GameState.SWRuleSet.featCount;
    // feat.2da has blank placeholder rows (e.g. ids 0/23) with no constant or
    // icon. The parsed TalentFeat stores these as '' (not the literal '****'), so
    // the old `constant != '****'` test let them through and they rendered as empty
    // rows. Require a real icon so blank rows never enter the list / chains.
    const isRealFeat = (f: any) => !!f && !!f.icon && f.icon !== '****' && !!f.constant && f.constant !== '****';
    let list = [];
    if(this.creature){
      const mainClass = this.creature.getMainClass();
      if(mainClass){
        for (let i = 0; i < featCount; i++) {
          const feat = feats[i];
          if (isRealFeat(feat)) {
            if (mainClass.isFeatAvailable(feat)) {
              const status = mainClass.getFeatStatus(feat);
              if (this.creature.getHasFeat(i) || status == 0 || status == 1) {
                list.push(feat);
              }
            }
          }
        }
      }
    }
    let groups = [];
    for (let i = 0; i < list.length; i++) {
      const feat = list[i];
      const group = [];
      const prereqfeat1 = GameState.SWRuleSet.feats[feat.prereqFeat1];
      const prereqfeat2 = GameState.SWRuleSet.feats[feat.prereqFeat2];
      if (!prereqfeat1 && !prereqfeat2) {
        group.push(feat);
        // Find the feats that chain off this base. Match against the base feat's
        // *id* — the old code compared to the loop index `i` (a position in `list`),
        // but prereqFeat1/2 are feat ids, so unrelated feats got chained together
        // and their icons didn't match the chain.
        for (let j = 0; j < featCount; j++) {
          const chainFeat = GameState.SWRuleSet.feats[j];
          if (!isRealFeat(chainFeat)) continue; // never chain blank placeholder feats
          if (chainFeat.prereqFeat1 == feat.id || chainFeat.prereqFeat2 == feat.id) {
            if (chainFeat.prereqFeat1 != -1 && chainFeat.prereqFeat2 != -1) {
              group[2] = chainFeat;
            } else {
              group[1] = chainFeat;
            }
          }
        }
      }
      if(group.length){
        groups.push(group);
      }
    }
    // Guard the sort: feats with prerequisites produce empty groups above, and
    // sorting on groupX[0].toolsCategories would throw on those. Also drop any
    // group whose base feat isn't a real (renderable) feat.
    groups = groups.filter(g => g.length && isRealFeat(g[0]));
    groups.sort((groupa, groupb) => groupa[0].toolsCategories > groupb[0].toolsCategories ? 1 : -1);
    this.LB_FEATS.setItems(groups);
  }
  
}
