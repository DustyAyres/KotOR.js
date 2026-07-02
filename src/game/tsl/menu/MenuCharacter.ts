import { GameState } from "@/GameState";
import { NetMode } from "@/enums/engine/NetMode";
import { LBL_3DView } from "@/gui";
import type { GUILabel, GUIButton, GUISlider } from "@/gui";
import { MDLLoader, TextureLoader } from "@/loaders";
import { OdysseyModel } from "@/odyssey";
import { OdysseyModel3D } from "@/three/odyssey";
import { MenuCharacter as K1_MenuCharacter } from "@/game/kotor/KOTOR";

/**
 * MenuCharacter class.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file MenuCharacter.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuCharacter extends K1_MenuCharacter {

  declare LBL_BAR6: GUILabel;
  declare LBL_STATSBORDER: GUILabel;
  declare LBL_MORE_BACK: GUILabel;
  declare LBL_XP_BACK: GUILabel;
  declare LBL_3DCHAR: GUILabel;
  declare BTN_3DCHAR: GUIButton;
  declare SLD_ALIGN: GUISlider;
  declare LBL_STR: GUILabel;
  declare LBL_FORTITUDE_STAT: GUILabel;
  declare LBL_REFLEX_STAT: GUILabel;
  declare LBL_WILL_STAT: GUILabel;
  declare LBL_DEFENSE_STAT: GUILabel;
  declare LBL_FORCE_STAT: GUILabel;
  declare LBL_VITALITY_STAT: GUILabel;
  declare LBL_DEX: GUILabel;
  declare LBL_CON: GUILabel;
  declare LBL_INT: GUILabel;
  declare LBL_CHA: GUILabel;
  declare LBL_WIS: GUILabel;
  declare LBL_STR_MOD: GUILabel;
  declare LBL_DEX_MOD: GUILabel;
  declare LBL_CON_MOD: GUILabel;
  declare LBL_INT_MOD: GUILabel;
  declare LBL_WIS_MOD: GUILabel;
  declare LBL_CHA_MOD: GUILabel;
  declare LBL_EXPERIENCE_STAT: GUILabel;
  declare LBL_NEEDED_XP: GUILabel;
  declare LBL_STRENGTH: GUILabel;
  declare LBL_DEXTERITY: GUILabel;
  declare LBL_CONSTITUTION: GUILabel;
  declare LBL_INTELLIGENCE: GUILabel;
  declare LBL_CHARISMA: GUILabel;
  declare LBL_REFLEX: GUILabel;
  declare LBL_WILL: GUILabel;
  declare LBL_EXPERIENCE: GUILabel;
  declare LBL_NEXT_LEVEL: GUILabel;
  declare LBL_FORCE: GUILabel;
  declare LBL_VITALITY: GUILabel;
  declare LBL_DEFENSE: GUILabel;
  declare LBL_FORTITUDE: GUILabel;
  declare LBL_BEVEL: GUILabel;
  declare LBL_WISDOM: GUILabel;
  declare LBL_BEVEL2: GUILabel;
  declare LBL_LIGHT: GUILabel;
  declare LBL_DARK: GUILabel;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR5: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare LBL_BAR3: GUILabel;
  declare LBL_BAR4: GUILabel;
  declare LBL_TITLE: GUILabel;
  declare BTN_EXIT: GUIButton;
  declare BTN_AUTO: GUIButton;
  declare BTN_LEVELUP: GUIButton;
  declare LBL_FORCEMASTERY: GUILabel;

  constructor(){
    super();
    this.gui_resref = 'character_p';
    this.background = 'blackfill';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {
      this.BTN_EXIT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
      this._button_b = this.BTN_EXIT;

      this.BTN_AUTO.addEventListener('click', (e) => {
        e.stopPropagation();
        if(GameState.netMode == NetMode.CLIENT){
          //Level-up state lives on the host; client-side leveling would desync.
          (this.manager.InGameConfirm as any)?.fromString?.('Leveling up is not yet supported for co-op players.');
          return;
        }
        if(GameState.getCurrentPlayer().canLevelUp()){
          GameState.getCurrentPlayer().autoLevelUp();
          this.updateCharacterStats(GameState.getCurrentPlayer());
        }
      });
      this._button_y = this.BTN_AUTO;

      // The "Level Up" button was always visible (the .gui default) and never wired, so a
      // fresh character appeared to have a level-up available when they didn't. Hide it by
      // default and only show it (via updateCharacterStats) when the character can level up.
      this.BTN_LEVELUP?.hide();
      // "Level Up" opens the manual level-up wizard (vs. BTN_AUTO = auto-allocate). The wizard
      // opens on top; when it closes this screen re-shows and updateCharacterStats refreshes.
      this.BTN_LEVELUP?.addEventListener('click', (e) => {
        e.stopPropagation();
        if(GameState.netMode == NetMode.CLIENT){
          (this.manager.InGameConfirm as any)?.fromString?.('Leveling up is not yet supported for co-op players.');
          return;
        }
        const pc = GameState.getCurrentPlayer();
        if(pc.canLevelUp()){
          (GameState.MenuManager.MenuLevelUp as any).startLevelUp(pc);
        }
      });

      this.BTN_CHANGE1?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (GameState.PartyManager.party.length > 1) {
          if(this.blockSwitchToClaimedMember(1)){ return; }
          GameState.PartyManager.SwitchLeaderAtIndex(1);
          this.updateCharacterPortrait(GameState.PartyManager.party[0]);
          this.updateCharacterStats(GameState.PartyManager.party[0]);
          this.updatePartyMemberPortraitButtons();
        }
      });
      this.BTN_CHANGE2?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (GameState.PartyManager.party.length > 2) {
          if(this.blockSwitchToClaimedMember(2)){ return; }
          GameState.PartyManager.SwitchLeaderAtIndex(2);
          this.updateCharacterPortrait(GameState.PartyManager.party[0]);
          this.updateCharacterStats(GameState.PartyManager.party[0]);
          this.updatePartyMemberPortraitButtons();
        }
      });

      GameState.PartyManager.AddEventListener('change', () => {
        if (!this.bVisible) return;
        this.updateCharacterPortrait(GameState.PartyManager.party[0]);
        this.updateCharacterStats(GameState.PartyManager.party[0]);
        this.updatePartyMemberPortraitButtons();
      });

      // Use charrec_light (the TSL character_p dais): it carries the alignment aura
      // animations (align1..align18 / good / evil) and the per-creature camerahook nodes.
      // charmain_light was the wrong model (only a single "neutral" anim, no alignment
      // poses), and the _3dView was being created *after* FromMDL — so the dais was built
      // with an undefined render context.
      MDLLoader.loader.load('charrec_light').then((mdl: OdysseyModel) => {
        this._3dView = new LBL_3DView(this.LBL_3DCHAR.extent.width, this.LBL_3DCHAR.extent.height);
        this._3dView.visible = true;
        this._3dView.setControl(this.LBL_3DCHAR);
        this._3dView.camera.aspect = this.LBL_3DCHAR.extent.width / this.LBL_3DCHAR.extent.height;
        this._3dView.camera.updateProjectionMatrix();
        (this.LBL_3DCHAR.getFill().material as any).visible = true;

        OdysseyModel3D.FromMDL(mdl, {
          context: this._3dView,
          // manageLighting: false,
        }).then((model: OdysseyModel3D) => {
          try{
            this._3dViewModel = model;
            this._3dView.addModel(this._3dViewModel);

            this._3dView.camera.position.copy(model.camerahook.position);
            this._3dView.camera.quaternion.copy(model.camerahook.quaternion);
          }catch(e){
            console.error(e);
            resolve();
            return;
          }

          TextureLoader.LoadQueue().then(() => {
            this._3dViewModel.playAnimation(0, true);
            resolve();
          });
        }).catch( (e: any) => {
          console.error(e);
          resolve();
        });
      }).catch( (e: any) => {
        console.error(e);
        resolve();
      });
    });
  }

  update(delta: number) {
    super.update(delta);
    if (!this.bVisible)
      return;
    if (this.char)
      this.char.update(delta);
    try {
      this._3dView.render(delta);
      (this.LBL_3DCHAR.getFill().material as any).needsUpdate = true;
    } catch (e: any) { }
  }

  /**
   * Co-op ownership gate: the host cannot switch to / manage a member that a
   * connected player controls (and clients cannot switch at all).
   */
  blockSwitchToClaimedMember(index: number): boolean {
    if(GameState.netMode == NetMode.CLIENT){ return true; }
    const member = GameState.PartyManager.party[index];
    if(member && member.ownerPeerId >= 0){
      (this.manager.InGameConfirm as any)?.fromString?.(`${member.getName?.() || member.tag} is controlled by another player.`);
      return true;
    }
    return false;
  }

  updateCharacterStats(character: any) {
    super.updateCharacterStats(character);
    // Show the manual "Level Up" button only when the character can actually level up
    // (mirrors BTN_AUTO, which the base toggles). Otherwise a fresh, no-XP character shows
    // a level-up option that isn't allowed.
    if (character && typeof character.canLevelUp === 'function' && character.canLevelUp()) {
      this.BTN_LEVELUP?.show();
    } else {
      this.BTN_LEVELUP?.hide();
    }
  }

  show() {
    super.show();
    try {
      this.recalculatePosition();
      //Co-op client: the sheet shows the claimed member, and character
      //switching is disabled (ownership gating, design §3/§6).
      const character = GameState.getLocalControlledCreature() ?? GameState.PartyManager.party[0];
      this.updateCharacterPortrait(character);
      this.updateCharacterStats(character);
      this.updatePartyMemberPortraitButtons();
      if(GameState.netMode == NetMode.CLIENT){
        this.BTN_CHANGE1?.hide();
        this.BTN_CHANGE2?.hide();
      }
    } catch (e) {
      console.error(e);
    }
  }

}
