import { GameState } from "@/GameState";
import type { GUIListBox, GUILabel, GUIButton } from "@/gui";
import { MenuJournal as K1_MenuJournal } from "@/game/kotor/KOTOR";
import { GUIJournalItem } from "@/game/tsl/gui/GUIJournalItem";

// TSL dialog.tlk: 32177 = "Completed Quests", 32178 = "Active Quests" — i.e. the two
// quest-mode strings are swapped relative to the K1 base constants. The sort strings
// (32173 "by Order Received" / 32174 by Name / 32175 by Priority / 32176 by Planet) match.
const STRREF_MODE_ACTIVE = 32178;
const STRREF_MODE_COMPLETED = 32177;
const STRREF_BY_RECIEVED = 32173;
const STRREF_BY_NAME = 32174;
const STRREF_BY_PRIORITY = 32175;
const STRREF_BY_PLANET = 32176;

enum JournalSort {
  RECIEVED = 0,
  NAME = 1,
  PRIORITY = 2,
  PLANET = 3,
}

enum JournalQuestMode {
  ACTIVE = 0,
  COMPLETED = 1,
}

/**
 * MenuJournal class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file MenuJournal.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuJournal extends K1_MenuJournal {

  declare LB_ITEMS: GUIListBox;
  declare LBL_TITLE: GUILabel;
  declare LBL_ITEM_DESCRIPTION: GUIListBox;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare LBL_BAR3: GUILabel;
  declare LBL_BAR4: GUILabel;
  declare LBL_BAR5: GUILabel;
  declare BTN_SWAPTEXT: GUIButton;
  declare BTN_FILTER_TIME: GUIButton;
  declare BTN_FILTER_NAME: GUIButton;
  declare BTN_FILTER_PRIORITY: GUIButton;
  declare BTN_FILTER_PLANET: GUIButton;
  declare BTN_MESSAGES: GUIButton;
  declare BTN_EXIT: GUIButton;

  constructor(){
    super();
    this.gui_resref = 'journal_p';
    this.background = 'blackfill';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {

      // The TSL init skips the K1 base menuControlInitializer (skipInit), so BTN_EXIT and
      // BTN_SWAPTEXT were never wired up here — wire them now.
      this.BTN_EXIT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
      this._button_b = this.BTN_EXIT;

      this.BTN_SWAPTEXT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.mode = this.mode === JournalQuestMode.ACTIVE ? JournalQuestMode.COMPLETED : JournalQuestMode.ACTIVE;
        this.updateList();
        this.UpdateLabels();
      });

      this.BTN_MESSAGES = this.getControlByName('BTN_MESSAGES');

      this.BTN_MESSAGES.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close()
        this.manager.MenuMessages.open();
      });

      this.LB_ITEMS.setProtoBuilder(GUIJournalItem);
      this.LB_ITEMS.onSelect = (node: any) => {
        console.log(node);
      };

      this.BTN_FILTER_TIME.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.RECIEVED;
        this.updateList();
        this.UpdateLabels();
      });

      this.BTN_FILTER_NAME.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.NAME;
        this.updateList();
        this.UpdateLabels();
      });

      this.BTN_FILTER_PRIORITY.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.PRIORITY;
        this.updateList();
        this.UpdateLabels();
      });

      this.BTN_FILTER_PLANET.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.PLANET;
        this.updateList();
        this.UpdateLabels();
      });

      resolve();
    });
  }

  /**
   * The TSL journal_p gui has no single BTN_SORT toggle (it uses four dedicated
   * BTN_FILTER_* buttons), so the K1 base UpdateLabels — which calls BTN_SORT.setText —
   * crashes on open. Override to set only the controls this layout has and reflect the
   * active sort with the filter buttons' pulsing highlight.
   */
  /** Button shows the mode you'd switch TO (TSL strrefs, swapped vs K1). */
  GetQuestModeBTNLabel(): string {
    return this.mode === JournalQuestMode.ACTIVE
      ? GameState.TLKManager.GetStringById(STRREF_MODE_COMPLETED).Value
      : GameState.TLKManager.GetStringById(STRREF_MODE_ACTIVE).Value;
  }

  GetMenuTitle(): string {
    const questModeLabel = this.mode === JournalQuestMode.ACTIVE
      ? GameState.TLKManager.GetStringById(STRREF_MODE_ACTIVE).Value
      : GameState.TLKManager.GetStringById(STRREF_MODE_COMPLETED).Value;
    const sortModeLabel = (
      this.sort === JournalSort.RECIEVED ? GameState.TLKManager.GetStringById(STRREF_BY_RECIEVED).Value :
      this.sort === JournalSort.NAME     ? GameState.TLKManager.GetStringById(STRREF_BY_NAME).Value :
      this.sort === JournalSort.PRIORITY ? GameState.TLKManager.GetStringById(STRREF_BY_PRIORITY).Value :
      this.sort === JournalSort.PLANET   ? GameState.TLKManager.GetStringById(STRREF_BY_PLANET).Value : ''
    );
    return `${questModeLabel} - ${sortModeLabel}`;
  }

  UpdateLabels(){
    this.BTN_SWAPTEXT?.setText(this.GetQuestModeBTNLabel());
    this.LBL_TITLE?.setText(this.GetMenuTitle());
    this.BTN_FILTER_TIME.pulsing = this.sort === JournalSort.RECIEVED;
    this.BTN_FILTER_NAME.pulsing = this.sort === JournalSort.NAME;
    this.BTN_FILTER_PRIORITY.pulsing = this.sort === JournalSort.PRIORITY;
    this.BTN_FILTER_PLANET.pulsing = this.sort === JournalSort.PLANET;
  }

  show() {
    super.show();
  }

}
