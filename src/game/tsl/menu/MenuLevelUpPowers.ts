import { GameState } from "@/GameState";
import { GameMenu } from "@/gui";
import type { GUIListBox, GUILabel, GUIButton } from "@/gui";
import { GUISpellItem } from "@/game/tsl/gui/GUISpellItem";
import type { ModuleCreature } from "@/module";
import { TalentSpell } from "@/talents";
import { TextureLoader } from "@/loaders";

/**
 * MenuLevelUpPowers class.
 *
 * The force-power selection step of the manual level-up wizard (GUI `pwrlvlup_p`), mirroring
 * the engine's CSWGuiPowersLevelUp (swkotor2.exe FUN_009074e0). Lists the force powers the
 * leveling class can learn at the new level, lets the player spend this level's power picks
 * (ClassPowerGain count), and adds each chosen power to the creature's KnownList.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file MenuLevelUpPowers.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuLevelUpPowers extends GameMenu {

  declare MAIN_TITLE_LBL: GUILabel;
  declare SUB_TITLE_LBL: GUILabel;
  declare LB_POWERS: GUIListBox;
  declare LB_DESC: GUIListBox;
  declare LBL_POWER: GUILabel;
  declare REMAINING_BOX_LBL: GUILabel;
  declare REMAINING_SELECTIONS_LBL: GUILabel;
  declare SELECTIONS_REMAINING_LBL: GUILabel;
  declare SELECT_BTN: GUIButton;
  declare ACCEPT_BTN: GUIButton;
  declare BACK_BTN: GUIButton;
  declare RECOMMENDED_BTN: GUIButton;

  /** spells.2da availability column per class id (swkotor2.exe spell-struct +0x40..+0x49). */
  static POWER_COLUMN: { [id: number]: string } = {
    3: 'guardian', 4: 'consular', 5: 'sentinel',
    11: 'weapmstr', 12: 'jedimaster', 13: 'watchman',
    14: 'marauder', 15: 'sithlord', 16: 'assassin',
  };

  creature: ModuleCreature;
  levelClassIndex: number = 0;
  remaining: number = 0;
  selectedPower: any = null; // a spells.2da row

  constructor(){
    super();
    this.gui_resref = 'pwrlvlup_p';
    this.background = '';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer();
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {
      this.BACK_BTN.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
      this._button_b = this.BACK_BTN;
      this.ACCEPT_BTN.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
      this.SELECT_BTN.addEventListener('click', (e) => { e.stopPropagation(); this.selectHighlighted(); });
      this.RECOMMENDED_BTN.addEventListener('click', (e) => { e.stopPropagation(); this.selectRecommended(); });
      this.LB_POWERS.onSelected = (node: any) => { this.onHighlight(node); };
      resolve();
    });
  }

  /** Configure the step for a creature/class before opening. */
  setup(creature: ModuleCreature, levelClassIndex: number, remaining: number){
    this.creature = creature;
    this.levelClassIndex = levelClassIndex;
    this.remaining = Math.max(0, remaining);
    this.selectedPower = null;
  }

  show() {
    GameState.PartyManager.Player = this.creature as any; // GUISpellItem reads party[0]
    super.show();
    this.LB_POWERS.setProtoBuilder(GUISpellItem);
    this.buildPowerList();
    this.updateRemaining();
  }

  /** spells.2da column gating power availability for the leveling class. */
  getClassColumn(){
    const cls: any = this.creature?.classes?.[this.levelClassIndex];
    return MenuLevelUpPowers.POWER_COLUMN[cls?.id] || 'inate';
  }

  /** Build the list of learnable, not-yet-known force powers for this class at the new level. */
  buildPowerList(){
    const cls: any = this.creature.classes[this.levelClassIndex];
    const newLevel = cls.level; // already incremented by the wizard
    const col = this.getClassColumn();
    const spells2da = GameState.TwoDAManager.datatables.get('spells');
    const list: any[] = [];
    if(spells2da){
      for(let i = 0; i < spells2da.RowCount; i++){
        const row = spells2da.rows[i];
        if(!row) continue;
        if(parseInt(row.usertype) !== 1) continue;            // force powers only
        if(!row.name || row.name === '****') continue;        // must have a TLK name
        const colVal = parseInt(row[col]);
        if(isNaN(colVal)) continue;                           // blank cell = class can't learn it
        if(colVal > newLevel) continue;                       // min level for this class
        if(this.creature.getHasSpell(i)) continue;            // already known
        if(!this.prerequisitesMet(row)) continue;             // base power must be learned first
        list.push(row);
      }
    }
    // GUISpellItem renders an array (a power chain); we surface each power as a single entry.
    this.LB_POWERS.setItems(list.map(r => [r]));
    // The item widgets enqueue their button-background + power-icon textures; flush the queue
    // so they actually load (otherwise the icons render as blank white squares).
    TextureLoader.LoadQueue();
  }

  /** True if the power has no unmet prerequisite powers (so upgrades only appear once you own
   * the lower tier — the engine's power-tree gating). prerequisites is an underscore list of
   * spell ids in spells.2da. */
  prerequisitesMet(row: any): boolean {
    const raw = row.prerequisites;
    if(!raw || raw === '****') return true;
    const ids = String(raw).split('_').map((s: string) => parseInt(s)).filter((n: number) => !isNaN(n));
    for(const id of ids){
      if(!this.creature.getHasSpell(id)) return false;
    }
    return true;
  }

  onHighlight(node: any){
    this.selectedPower = null;
    const row = Array.isArray(node) ? node[0] : node;
    if(row && !this.creature.getHasSpell(row.__index)){
      this.selectedPower = row;
    }
    if(row){
      this.LBL_POWER?.setText(this.getPowerName(row));
      if(this.LB_DESC && typeof (this.LB_DESC as any).setText === 'function'){
        (this.LB_DESC as any).setText(this.getPowerDescription(row));
      }
    }
  }

  selectHighlighted(){
    if(this.remaining <= 0 || !this.selectedPower) return;
    const id = this.selectedPower.__index;
    if(this.creature.getHasSpell(id)) return;
    const cls: any = this.creature.classes[this.levelClassIndex];
    cls.addSpell(new TalentSpell(id));
    this.remaining--;
    this.selectedPower = null;
    this.buildPowerList();
    this.updateRemaining();
  }

  selectRecommended(){
    const items: any[] = (this.LB_POWERS as any).listItems || [];
    for(const node of items){
      if(this.remaining <= 0) break;
      const row = Array.isArray(node) ? node[0] : node;
      if(row && !this.creature.getHasSpell(row.__index)){
        const cls: any = this.creature.classes[this.levelClassIndex];
        cls.addSpell(new TalentSpell(row.__index));
        this.remaining--;
      }
    }
    this.buildPowerList();
    this.updateRemaining();
  }

  updateRemaining(){
    const txt = String(this.remaining);
    this.REMAINING_SELECTIONS_LBL?.setText(txt);
    this.SELECTIONS_REMAINING_LBL?.setText(txt);
    this.REMAINING_BOX_LBL?.setText(txt);
  }

  protected getPowerName(row: any): string {
    try { const s = GameState.TLKManager.TLKStrings[parseInt(row.name)]; return (s && s.Value) || row.label || ''; }
    catch(e){ return row.label || ''; }
  }

  protected getPowerDescription(row: any): string {
    try { const s = GameState.TLKManager.TLKStrings[parseInt(row.spelldesc)]; return (s && s.Value) || ''; }
    catch(e){ return ''; }
  }

}
