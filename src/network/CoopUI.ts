import { GameState } from "@/GameState";
import { NetMode } from "@/enums/engine/NetMode";
import { COOP_DEFAULT_PORT, COOP_DEFAULT_SESSION } from "@/network/CoopProtocol";
import { CoopClientMirror } from "@/network/CoopClientMirror";

/**
 * CoopUI — minimal DOM-overlay UI for co-op sessions (precedent: the Combat
 * Arena game-over overlay). Provides:
 *  - a CO-OP button + host/join panel on the main menu
 *  - a party-claim overlay for connected clients
 *  - a small status chip while a session is active
 *
 * A .gui-native lobby (MenuPartySelection reuse) can replace this later; the
 * DOM overlay keeps v1 unconstrained (the engine's GUILabel text input can't
 * type '.' or ':' for addresses).
 */

const COLORS = {
  bg: 'rgba(0, 14, 10, 0.92)',
  border: '#0eb98c',
  text: '#9be8cf',
  accent: '#17e0a5',
  danger: '#e05a5a',
};

export class CoopUI {

  static #root: HTMLDivElement | undefined;
  static #menuButton: HTMLButtonElement | undefined;
  static #panel: HTMLDivElement | undefined;
  static #claimOverlay: HTMLDivElement | undefined;
  static #statusChip: HTMLDivElement | undefined;
  static #statusTimer: number | undefined;

  static #ensureRoot(): HTMLDivElement {
    if(!this.#root){
      const root = document.createElement('div');
      root.id = 'coop-ui';
      document.body.appendChild(root);
      this.#root = root;
    }
    return this.#root;
  }

  static #styleButton(btn: HTMLButtonElement, primary = false){
    btn.style.cssText = `
      background: ${primary ? COLORS.border : 'transparent'};
      color: ${primary ? '#00241a' : COLORS.text};
      border: 1px solid ${COLORS.border};
      padding: 6px 14px; margin: 4px; cursor: pointer;
      font-family: monospace; font-size: 13px; letter-spacing: 1px;
    `;
  }

  static #styleInput(input: HTMLInputElement){
    input.style.cssText = `
      background: rgba(0,0,0,0.5); color: ${COLORS.text};
      border: 1px solid ${COLORS.border}; padding: 5px 8px; margin: 3px 0;
      font-family: monospace; font-size: 13px; width: 240px; display: block;
    `;
  }

  /**
   * Attach the CO-OP entry to the main menu (called from MainMenu init).
   * Self-hides once a co-op session is active or the menu goes away.
   */
  static attachMainMenu(){
    if(this.#menuButton){ return; }
    const root = this.#ensureRoot();

    const btn = document.createElement('button');
    btn.textContent = 'CO-OP';
    this.#styleButton(btn, true);
    btn.style.position = 'fixed';
    btn.style.right = '18px';
    btn.style.bottom = '18px';
    btn.style.zIndex = '1000';
    btn.onclick = () => this.togglePanel();
    root.appendChild(btn);
    this.#menuButton = btn;

    GameState.NetworkManager?.addEventListener('connected', () => {
      this.hidePanel();
      this.showStatusChip();
    });
    GameState.NetworkManager?.addEventListener('disconnected', () => {
      this.hideStatusChip();
      this.hideClaimOverlay();
    });
    GameState.NetworkManager?.addEventListener('slot-assigned', (peerId: number) => {
      if(peerId == GameState.NetworkManager.peerId){
        this.hideClaimOverlay();
      }
    });
  }

  static togglePanel(){
    if(this.#panel){ this.hidePanel(); return; }
    const root = this.#ensureRoot();
    const nm = GameState.NetworkManager;

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed; right: 18px; bottom: 64px; z-index: 1000;
      background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      padding: 14px 16px; font-family: monospace; color: ${COLORS.text};
      min-width: 280px;
    `;
    panel.innerHTML = `<div style="font-size:14px; letter-spacing:2px; color:${COLORS.accent}; margin-bottom:8px;">CO-OP / NET PLAY</div>`;

    const addrInput = document.createElement('input');
    addrInput.placeholder = `relay address (ws://host:${COOP_DEFAULT_PORT})`;
    addrInput.value = nm?.defaultAddress() ?? '';
    this.#styleInput(addrInput);

    const sessionInput = document.createElement('input');
    sessionInput.placeholder = 'session code';
    sessionInput.value = COOP_DEFAULT_SESSION;
    this.#styleInput(sessionInput);

    const nameInput = document.createElement('input');
    nameInput.placeholder = 'player name';
    nameInput.value = 'player';
    this.#styleInput(nameInput);

    const status = document.createElement('div');
    status.style.cssText = `font-size: 12px; margin-top: 6px; min-height: 16px; color:${COLORS.text};`;

    const hostBtn = document.createElement('button');
    hostBtn.textContent = 'HOST GAME';
    this.#styleButton(hostBtn, true);
    hostBtn.onclick = async () => {
      status.textContent = 'starting host session...';
      try{
        await nm.host(addrInput.value.trim(), sessionInput.value.trim().toUpperCase() || COOP_DEFAULT_SESSION);
        status.textContent = 'hosting! start or load a game — players can join anytime.';
      }catch(e: any){
        status.textContent = `host failed: ${e?.message ?? e}`;
        status.style.color = COLORS.danger;
      }
    };

    const joinBtn = document.createElement('button');
    joinBtn.textContent = 'JOIN GAME';
    this.#styleButton(joinBtn);
    joinBtn.onclick = async () => {
      status.textContent = 'connecting...';
      try{
        await nm.join(addrInput.value.trim(), sessionInput.value.trim().toUpperCase() || COOP_DEFAULT_SESSION, nameInput.value.trim() || 'player');
        status.textContent = "connected — loading the host's world...";
        this.waitForMirrorThenClaim();
      }catch(e: any){
        status.textContent = `join failed: ${e?.message ?? e}`;
        status.style.color = COLORS.danger;
      }
    };

    panel.appendChild(addrInput);
    panel.appendChild(sessionInput);
    panel.appendChild(nameInput);
    panel.appendChild(hostBtn);
    panel.appendChild(joinBtn);
    panel.appendChild(status);
    root.appendChild(panel);
    this.#panel = panel;
  }

  static hidePanel(){
    this.#panel?.remove();
    this.#panel = undefined;
  }

  /** Hide the main-menu button (game started / session active). */
  static detachMainMenu(){
    this.hidePanel();
    this.#menuButton?.remove();
    this.#menuButton = undefined;
  }

  /** Poll for the world mirror, then present the party-claim overlay. */
  static waitForMirrorThenClaim(){
    const wait = setInterval(() => {
      if(GameState.netMode != NetMode.CLIENT){
        clearInterval(wait);
        return;
      }
      if(CoopClientMirror.ready){
        clearInterval(wait);
        this.detachMainMenu();
        this.showClaimOverlay();
        this.showStatusChip();
      }
    }, 500);
  }

  /** Party-claim overlay: pick which of the host's party members to control. */
  static showClaimOverlay(){
    this.hideClaimOverlay();
    const root = this.#ensureRoot();
    const nm = GameState.NetworkManager;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%);
      z-index: 1001; background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      padding: 18px 22px; font-family: monospace; color: ${COLORS.text};
      min-width: 340px;
    `;
    overlay.innerHTML = `<div style="font-size:15px; letter-spacing:2px; color:${COLORS.accent}; margin-bottom:10px;">CLAIM A PARTY MEMBER</div>`;

    const list = document.createElement('div');
    overlay.appendChild(list);

    const render = () => {
      list.innerHTML = '';
      const party = GameState.PartyManager.party;
      for(let i = 0; i < party.length; i++){
        const member = party[i];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin:4px 0;';
        const label = document.createElement('span');
        const name = member.getName?.() || member.tag || `slot ${i}`;
        const owner = i == 0 ? ' (host)' : (member.ownerPeerId == nm.peerId ? ' (you)' : (member.ownerPeerId >= 0 ? ` (player ${member.ownerPeerId})` : ''));
        label.textContent = `${i}. ${name}${owner}`;
        row.appendChild(label);
        if(i > 0 && (member.ownerPeerId < 0 || member.ownerPeerId == nm.peerId)){
          const claim = document.createElement('button');
          claim.textContent = member.ownerPeerId == nm.peerId ? 'CLAIMED' : 'CLAIM';
          this.#styleButton(claim, member.ownerPeerId != nm.peerId);
          claim.disabled = member.ownerPeerId == nm.peerId;
          claim.onclick = () => { nm.claimSlot(i); };
          row.appendChild(claim);
        }
        list.appendChild(row);
      }
    };
    render();
    const refresh = setInterval(() => {
      if(!this.#claimOverlay){ clearInterval(refresh); return; }
      render();
    }, 1000);

    const spectate = document.createElement('button');
    spectate.textContent = 'SPECTATE';
    this.#styleButton(spectate);
    spectate.onclick = () => this.hideClaimOverlay();
    overlay.appendChild(spectate);

    root.appendChild(overlay);
    this.#claimOverlay = overlay;
  }

  static hideClaimOverlay(){
    this.#claimOverlay?.remove();
    this.#claimOverlay = undefined;
  }

  /** Small always-on status chip while a session is active. */
  static showStatusChip(){
    if(this.#statusChip){ return; }
    const root = this.#ensureRoot();
    const chip = document.createElement('div');
    chip.style.cssText = `
      position: fixed; left: 50%; top: 4px; transform: translateX(-50%);
      z-index: 999; background: rgba(0,14,10,0.75); border: 1px solid ${COLORS.border};
      padding: 2px 10px; font-family: monospace; font-size: 11px; color: ${COLORS.text};
      pointer-events: none;
    `;
    root.appendChild(chip);
    this.#statusChip = chip;
    const update = () => {
      const nm = GameState.NetworkManager;
      if(!nm?.isActive()){
        chip.textContent = 'CO-OP: disconnected';
        return;
      }
      if(nm.isHost()){
        const peers = [...nm.peers.values()];
        const names = peers.map(p => `${p.name || ('peer ' + p.peerId)}${p.controlledCreature ? '→' + (p.controlledCreature.getName?.() || p.controlledCreature.tag) : ''}`);
        chip.textContent = `CO-OP HOST · ${peers.length} player${peers.length == 1 ? '' : 's'}${names.length ? ' · ' + names.join(', ') : ''}`;
      }else{
        const controlling = nm.controlledCreature ? (nm.controlledCreature.getName?.() || nm.controlledCreature.tag) : 'spectating';
        chip.textContent = `CO-OP · ${controlling} · ${nm.rtt >= 0 ? nm.rtt + 'ms' : '...'}`;
      }
    };
    update();
    this.#statusTimer = window.setInterval(update, 1000);
  }

  static hideStatusChip(){
    if(this.#statusTimer){ clearInterval(this.#statusTimer); this.#statusTimer = undefined; }
    this.#statusChip?.remove();
    this.#statusChip = undefined;
  }
}
