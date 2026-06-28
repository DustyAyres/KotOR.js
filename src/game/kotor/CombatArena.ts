import { GameState } from "@/GameState";
import { GFFObject } from "@/resource/GFFObject";
import { GFFField } from "@/resource/GFFField";
import { GFFDataType } from "@/enums/resource/GFFDataType";
import { ResourceLoader } from "@/loaders";
import { ResourceTypes } from "@/resource/ResourceTypes";
import { EngineMode } from "@/enums/engine/EngineMode";
import { EngineState } from "@/enums/engine/EngineState";
import { ModuleObjectScript } from "@/enums/module/ModuleObjectScript";
import { CurrentGame } from "@/engine/CurrentGame";
import { NWScript } from "@/nwscript/NWScript";

/**
 * CombatArena (K1 test harness).
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * A developer/QA entry point that jumps straight into a combat sandbox:
 *  - boots a fully-kitted Jedi player character (lightsaber + all Force powers + high HP/FP),
 *  - loads an open module to use as an arena and strips its own encounters,
 *  - spawns a variety of hostile enemy types in front of the player.
 *
 * Wired to the (otherwise unused) BTN_WARP slot on the K1 main menu. It is a test
 * tool only — it does not provision story/journal/global state.
 *
 * @file CombatArena.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CombatArena {
  /** Taris Upper City Cantina — the in-game Dueling Arena. Open floor, fitting for a combat sandbox. */
  static MODULE = 'tar_m02ae';

  /**
   * Enemy blueprint resrefs to spawn. All ship inside tar_m02ae_s.rim, so they are present in the
   * module resource cache once the arena loads. The cantina duelists — a varied roster of melee,
   * ranged, and a champion boss. Duelists are normally neutral, so spawnEnemies() forces them into
   * a hostile faction (see resolveHostileFaction).
   */
  static ENEMIES = [
    'tar02_bendak021',  // Bendak Starkiller (champion / boss)
    // Other duelists disabled for now — re-enable as needed:
    // 'tar02_twitch021',  // Twitch
    // 'tar02_gerlon021',  // Gerlon Two-Fingers
    // 'tar02_ice021',     // Ice
    // 'tar02_marl021',    // Marl (heavy melee)
    // 'tar02_deadeye022', // Dead Eye Duncan (ranged blaster)
  ];

  /** Starting alignment for the test PC (GoodEvil: 0 = pure dark .. 50 = neutral .. 100 = pure light). */
  static PC_ALIGNMENT: number = 5;

  /** Lazily-resolved faction id that is hostile to the player (so spawned duelists actually fight). */
  static hostileFactionId: number = -1;

  /** Guard so the death -> game-over -> menu flow runs exactly once per arena session. */
  static deathHandled: boolean = false;

  /**
   * Launch the combat arena. Safe to call from the main menu (no game in progress).
   */
  static async Launch(): Promise<void> {
    try {
      console.log('[ARENA] Launching combat test arena...');

      // 1) Provision a fully-kitted Jedi PC (mirrors AppState.quickStart's bootstrap).
      const PM = GameState.PartyManager;
      const template = CombatArena.generateJediTemplate();
      PM.PlayerTemplate = template;
      PM.ActualPlayerTemplate = template;
      try {
        const pc = new GameState.Module.ModuleArea.ModulePlayer(template);
        pc.load();
        PM.AddPortraitToOrder(pc.getPortraitResRef());
      } catch (e) { console.warn('[ARENA] portrait setup skipped', e); }

      GameState.GlobalVariableManager.Init();
      await CurrentGame.InitGameInProgressFolder(true);

      // 2) Load the arena module.
      await GameState.LoadModule(CombatArena.MODULE);

      // Disable the area's OnEnter/OnHeartbeat immediately — before the first gameplay tick can run
      // them — so the module's opening cutscene/conversation never starts. The watcher is a backup
      // that dismisses anything that slips through. This is what keeps the arena intro from playing.
      CombatArena.disableAreaScripts();
      CombatArena.startDialogSkipWatcher();

      // 3) Wait for the area to be fully ready before touching its objects.
      await CombatArena.waitForReady();

      // 4) Strip the module's own encounters/creatures (and re-assert the script disable).
      CombatArena.cleanArena();

      // 5) Move into the dueling ring (not the cantina entrance) and kit the player.
      CombatArena.repositionToArena();
      CombatArena.kitPlayer();

      // 6) Spawn the hostile test enemies across the ring.
      await CombatArena.spawnEnemies();

      if (GameState.Mode === EngineMode.DIALOG) {
        GameState.SetEngineMode(EngineMode.INGAME);
      }

      // 7) Watch for the player's death so we can show the game-over screen and return to the menu.
      CombatArena.startDeathWatcher();

      console.log('[ARENA] Combat arena ready.');
    } catch (e) {
      console.error('[ARENA] Launch failed', e);
    }
  }

  /**
   * Build a player template based on the default PC but flipped to a high-level Jedi
   * (spellcaster) class with a large HP/Force pool. The default template already equips
   * a lightsaber (g_w_lghtsbr01) + Jedi robe, so no manual item wiring is needed.
   */
  static generateJediTemplate(): GFFObject {
    const tpl = GameState.PartyManager.GeneratePlayerTemplate();
    const root = tpl.RootNode;

    // Set an existing template field, or ADD it if GeneratePlayerTemplate didn't include it.
    // The base template omits the HitPoints/ForcePoints fields, so a plain set was a no-op and the
    // PC was born at 0 HP — its first self-update() in loadModel() saw isDead() and played the death
    // animation until kitPlayer() topped HP back up (the "injured for a split second" flicker on
    // entering the arena). Adding the fields means the PC loads alive.
    const setVal = (label: string, value: number, type: GFFDataType = GFFDataType.SHORT) => {
      let f = root.getFieldByLabel(label);
      if (!f) f = root.addField(new GFFField(type, label));
      f.setValue(value);
    };

    // Flip the single starting class to a Jedi (spellcaster) class at a high level.
    const jediClassId = CombatArena.findJediClassId();
    try {
      const classList = root.getFieldByLabel('ClassList');
      const cls = classList ? classList.getChildStructs()[0] : undefined;
      if (cls) {
        cls.getFieldByLabel('Class').setValue(jediClassId);
        cls.getFieldByLabel('ClassLevel').setValue(12);
      }
    } catch (e) { console.warn('[ARENA] could not set Jedi class', e); }

    // Survivability + Force pool. getHP() = MaxHitPoints + CurrentHitPoints - HitPoints,
    // so set all three equal to start at full health.
    setVal('HitPoints', 240);
    setVal('MaxHitPoints', 240);
    setVal('CurrentHitPoints', 240);
    setVal('ForcePoints', 200);
    setVal('MaxForcePoints', 200);
    setVal('CurrentForce', 200);

    // Combat-viable ability scores.
    setVal('Str', 16);
    setVal('Dex', 16);
    setVal('Con', 16);
    setVal('Wis', 16);
    setVal('Cha', 14);

    // Start the arena PC dark-side aligned for testing (GoodEvil: 0 = pure dark .. 100 = pure light).
    // ModuleCreature doesn't read GoodEvil from the template, so kitPlayer() also sets it on the live
    // PC; this template value is what the portrait lookup (PartyManager.getPortrait) reads.
    setVal('GoodEvil', CombatArena.PC_ALIGNMENT);

    return tpl;
  }

  /** Find a Jedi (spellcaster) class id from classes.2da; falls back to K1 Jedi Guardian (3). */
  static findJediClassId(): number {
    try {
      const classes = GameState.TwoDAManager.datatables.get('classes');
      const rows = classes?.rows || {};
      const count = classes?.RowCount || 0;
      // Prefer Jedi Guardian for a melee-leaning combat test.
      for (let i = 0; i < count; i++) {
        const label = `${rows[i]?.label ?? ''}`.toLowerCase();
        if (label.includes('guardian')) return i;
      }
      // Otherwise the first spellcaster class.
      for (let i = 0; i < count; i++) {
        const sc = `${rows[i]?.spellcaster ?? ''}`.toLowerCase();
        if (sc === '1' || sc === 'true') return i;
      }
    } catch (e) { console.warn('[ARENA] findJediClassId failed', e); }
    return 3;
  }

  /** Top up the live PC's HP/FP and grant every Force power to its primary class. */
  static kitPlayer(): void {
    const pc: any = GameState.getCurrentPlayer();
    if (!pc) { console.warn('[ARENA] no player to kit'); return; }

    pc.hitPoints = 240;
    pc.maxHitPoints = 240;
    pc.currentHitPoints = 240;
    pc.forcePoints = 200;
    pc.maxForcePoints = 200;
    // getFP() derives from currentForce (mirrors getHP()/currentHitPoints), so seed it too —
    // otherwise the kitted PC reads 0 FP and can't sustain casts.
    pc.currentForce = 200;
    // The PC must actually be able to die so the game-over flow can trigger (isDead() is
    // gated on !min1HP). A fresh template leaves this false, but assert it for safety.
    pc.min1HP = false;

    // Dark-side alignment for testing the alignment visuals (character-screen evil pose + red aura)
    // and any alignment-gated behaviour. Set directly (not setGoodEvil) to skip the DARK_SHIFT HUD
    // notification it would queue. 0 = pure dark .. 100 = pure light.
    pc.goodEvil = CombatArena.PC_ALIGNMENT;

    // Give the PC the full melee moveset (Power Attack / Flurry / Critical Strike, etc.).
    CombatArena.grantMeleeFeats();

    const cls: any = pc.classes && pc.classes[0];
    let granted = 0;
    if (cls && typeof cls.addSpell === 'function') {
      try {
        const spells = GameState.TwoDAManager.datatables.get('spells');
        const rows = spells?.rows || {};
        const count = spells?.RowCount || 0;
        const existing = new Set((cls.getSpells?.() || []).map((s: any) => s.id));
        for (let i = 0; i < count; i++) {
          const row = rows[i];
          const fp = parseInt(row?.forcepoints);
          const name = parseInt(row?.name);
          // Force powers cost Force points and have a display name; this filters out
          // grenade/item/innate spell rows.
          if (!isNaN(fp) && fp > 0 && !isNaN(name) && name >= 0 && !existing.has(i)) {
            try { cls.addSpell(new GameState.TalentSpell(i)); existing.add(i); granted++; } catch (e) { /* skip bad row */ }
          }
        }
      } catch (e) { console.warn('[ARENA] granting Force powers failed', e); }
    }
    console.log(`[ARENA] PC kitted: HP ${pc.getHP?.()}/${pc.getMaxHP?.()} FP ${pc.forcePoints}/${pc.maxForcePoints}, granted ${granted} Force powers`);
  }

  /**
   * Grant a creature the full melee moveset (defaults to the live PC).
   *
   * The combat radial surfaces a creature's melee attack-FORM feats (category 0x1104) when a
   * melee/lightsaber weapon is equipped — see ActionMenuManager. Those are the three K1 attack
   * chains: Power Attack, Flurry, and Critical Strike (each base -> Improved -> Master). We grant
   * every tier so all the attack forms are available, plus the passive lightsaber/melee
   * proficiency-focus-specialization and the two-weapon line so the swings actually connect and hit
   * hard. The category-0x1104 scan over feat.2da is a safety net that also picks up any modded
   * melee attack forms beyond the stock chains.
   *
   * Granting these to the spawned enemies (not just the PC) lets the combat AI fight back with
   * attack forms — see ModuleCreature.pickCombatAttackForm + the updateCombat fallback.
   */
  static grantMeleeFeats(creature?: any): void {
    const who: any = creature || GameState.getCurrentPlayer();
    if (!who || typeof who.addFeat !== 'function') { console.warn('[ARENA] no creature to grant melee feats'); return; }

    let granted = 0;
    const give = (id: number) => {
      if (typeof id !== 'number' || isNaN(id) || id < 0) return;
      if (typeof who.getHasFeat === 'function' && who.getHasFeat(id)) return;
      try { who.addFeat(id); granted++; } catch (e) { /* skip a bad/absent feat row */ }
    };

    // Melee attack forms (category 0x1104), every tier: Power Attack 28/17/83,
    // Flurry 11/91/53, Critical Strike 8/19/81.
    const ATTACK_FORMS = [28, 17, 83, 11, 91, 53, 8, 19, 81];
    ATTACK_FORMS.forEach(give);

    // Passive melee competence so the attacks land and hit hard (these don't appear in the
    // radial): lightsaber + generic-melee proficiency/focus/specialization, the two-weapon
    // line, and Toughness.
    const PASSIVE = [
      43, 36, 50, // WEAPON_{PROF,FOCUS,SPEC}_LIGHTSABER
      44, 37, 51, // WEAPON_{PROF,FOCUS,SPEC}_MELEE_WEAPONS
      3, 9, 85,   // TWO_WEAPON_FIGHTING / _ADVANCED / _MASTERY
      84,         // TOUGHNESS
    ];
    PASSIVE.forEach(give);

    // Safety net: grant any other melee attack-form feat (category 0x1104) the data defines.
    try {
      const feat = GameState.TwoDAManager.datatables.get('feat');
      const count = feat?.RowCount || 0;
      for (let i = 0; i < count; i++) {
        if (typeof who.getHasFeat === 'function' && who.getHasFeat(i)) continue;
        let category = -1;
        try { category = new GameState.TalentFeat(i).category; } catch (e) { continue; }
        if (category === 0x1104) give(i);
      }
    } catch (e) { console.warn('[ARENA] melee attack-feat scan failed', e); }

    const label = (who === GameState.getCurrentPlayer()) ? 'PC' : (who.getTag ? who.getTag() : 'creature');
    console.log(`[ARENA] ${label} granted ${granted} melee feats (attack forms + proficiencies)`);
  }

  /** Null out the area's OnEnter/OnHeartbeat scripts so they can't start the module's intro/cutscene. */
  static disableAreaScripts(): void {
    const area: any = GameState.module?.area;
    if (!area || !area.scripts) return;
    try {
      area.scripts[ModuleObjectScript.AreaOnEnter] = undefined;
      area.scripts[ModuleObjectScript.AreaOnHeartbeat] = undefined;
    } catch (e) { /* best effort */ }
  }

  /** Remove the module's own encounters/creatures and disable its area scripts. */
  static cleanArena(): void {
    const area: any = GameState.module?.area;
    if (!area) return;

    CombatArena.disableAreaScripts();

    // Remove the module's pre-placed creatures (destroy() also detaches the model + array entry).
    try {
      let guard = 0;
      while (area.creatures.length && guard++ < 512) {
        area.creatures[0].destroy();
      }
    } catch (e) { console.warn('[ARENA] clearing creatures failed', e); }

    // Remove encounters so they don't spawn their own creature waves.
    try {
      while (area.encounters && area.encounters.length) {
        const enc = area.encounters[0];
        if (typeof enc?.destroy === 'function') enc.destroy();
        area.encounters.splice(0, 1);
      }
    } catch (e) { /* best effort */ }
  }

  /**
   * Resolve a faction id that is hostile to the player. Reputation <= 10 toward the PC faction (0)
   * means hostile; the standard "Hostile" faction qualifies. Falls back to standard faction id 1.
   */
  static resolveHostileFaction(): number {
    if (CombatArena.hostileFactionId >= 0) return CombatArena.hostileFactionId;
    let resolved = 1;
    try {
      const factions = GameState.FactionManager?.factions;
      if (factions) {
        factions.forEach((faction: any, id: number) => {
          if (resolved === 1 && id !== 0) {
            const rep = faction?.reputations?.[0];
            if (rep && typeof rep.reputation === 'number' && rep.reputation <= 10) resolved = id;
          }
        });
      }
    } catch (e) { console.warn('[ARENA] resolveHostileFaction failed', e); }
    CombatArena.hostileFactionId = resolved;
    return resolved;
  }

  /** Force a creature and the player to be mutually faction-hostile (reputation 0 both ways). */
  static makeMutuallyHostile(creature: any, pc: any, hostileFactionId: number): void {
    const fm: any = GameState.FactionManager;
    const pcFactionId = (pc && typeof pc.factionId === 'number') ? pc.factionId : 0;
    creature.factionId = hostileFactionId;
    creature.faction = fm.factions.get(hostileFactionId);
    if (pc && !pc.faction) pc.faction = fm.factions.get(pcFactionId);
    const setRep = (faction: any, towardId: number) => {
      if (!faction) return;
      if (typeof faction.setReputation === 'function') { try { faction.setReputation(towardId, 0); return; } catch (e) {} }
      if (faction.reputations && faction.reputations[towardId] && typeof faction.reputations[towardId].reputation === 'number') {
        faction.reputations[towardId].reputation = 0;
      }
    };
    setRep(creature.faction, pcFactionId);  // enemy hostile to player
    setRep(pc && pc.faction, hostileFactionId); // player hostile to enemy (red HUD reticle)
  }

  /** Look up a waypoint's world position by tag (clone), or null if not present. */
  static getWaypointPos(tag: string): any {
    const area: any = GameState.module?.area;
    if (!area || !area.waypoints) return null;
    const t = tag.toLowerCase();
    const wp = area.waypoints.find((w: any) => `${w?.getTag ? w.getTag() : (w?.tag ?? '')}`.toLowerCase() === t);
    return wp && wp.position ? wp.position.clone() : null;
  }

  /** Facing angle (engine convention: forward = (-sin f, cos f)) so an object at `from` looks at `to`. */
  static facingToward(from: any, to: any): number {
    return Math.atan2(-(to.x - from.x), (to.y - from.y));
  }

  /** Teleport the player into the dueling ring (tar02_wppcarena), facing the opponent spot. */
  static repositionToArena(): void {
    const pc: any = GameState.getCurrentPlayer();
    const area: any = GameState.module?.area;
    if (!pc || !area) return;
    const pcSpot = CombatArena.getWaypointPos('tar02_wppcarena');
    if (!pcSpot) { console.warn('[ARENA] arena waypoint tar02_wppcarena not found; staying at module entry'); return; }
    pc.position.copy(pcSpot);
    const oppSpot = CombatArena.getWaypointPos('tar02_wpopparena');
    if (oppSpot) pc.setFacing(CombatArena.facingToward(pcSpot, oppSpot), true);
    try { pc.getCurrentRoom?.(); } catch (e) { /* non-fatal */ }
    try { pc.computeBoundingBox?.(); } catch (e) { /* non-fatal */ }
    console.log('[ARENA] player moved into the dueling ring (tar02_wppcarena)');
  }

  /** Spawn the test enemies clustered on the opponent's arena spot, snapped to the walkmesh. */
  static async spawnEnemies(): Promise<void> {
    const pc: any = GameState.getCurrentPlayer();
    const area: any = GameState.module?.area;
    if (!pc || !area) { console.warn('[ARENA] cannot spawn enemies (no player/area)'); return; }

    const hostileFaction = CombatArena.resolveHostileFaction();
    const pcPos = pc.position.clone();
    // Cluster the enemies on the opponent's arena spot across the ring; fall back to in front of the PC.
    const oppPos = CombatArena.getWaypointPos('tar02_wpopparena')
      || CombatArena.getWaypointPos('tar02_wppcarena2')
      || pcPos.clone();
    const enemyFacing = CombatArena.facingToward(oppPos, pcPos);
    const list = CombatArena.ENEMIES;
    const arc = Math.PI * 0.7;

    for (let i = 0; i < list.length; i++) {
      const resref = list[i];
      const buffer = ResourceLoader.loadCachedResource(ResourceTypes['utc'], resref);
      if (!buffer) { console.warn(`[ARENA] enemy blueprint not found in module cache: ${resref}`); continue; }
      try {
        const creature: any = new GameState.Module.ModuleArea.ModuleCreature(new GFFObject(buffer));
        creature.load();
        creature.clearAllActions();

        // Line the enemies up ABREAST facing the player (spread along the axis perpendicular to the
        // facing), with a slight front/back stagger, then snap onto the walkmesh. Wide spacing keeps
        // them from spawning on top of / hitching on each other.
        // forward(f) = (-sin f, cos f); its right-hand perpendicular = (cos f, sin f).
        const rightX = Math.cos(enemyFacing);
        const rightY = Math.sin(enemyFacing);
        const lateral = (i - (list.length - 1) / 2) * 2.6; // ~2.6m apart, centered on the opponent spot
        const depth = (i % 2) * 1.8;                        // stagger ranks so they don't share a line
        const desired = pcPos.clone().set(
          oppPos.x + rightX * lateral - Math.sin(enemyFacing) * depth,
          oppPos.y + rightY * lateral + Math.cos(enemyFacing) * depth,
          oppPos.z,
        );
        const spot = (typeof area.getNearestWalkablePoint === 'function')
          ? area.getNearestWalkablePoint(desired, 1.5)
          : desired;
        creature.position.set(spot.x, spot.y, spot.z);
        creature.setFacing(CombatArena.facingToward(creature.position, pcPos), true); // face the player

        area.attachObject(creature);

        const model = await creature.loadModel();
        creature.model.userData.moduleObject = creature;
        model.hasCollision = true;
        model.name = creature.getTag();
        GameState.group.creatures.add(creature.container);

        creature.getCurrentRoom();
        try { creature.computeBoundingBox(); } catch (e) { /* non-fatal */ }
        creature.onSpawn();

        // Give the enemy the same melee moveset as the PC so the AI fights back with attack
        // forms (Power Attack / Flurry / Critical Strike) instead of only basic swings.
        CombatArena.grantMeleeFeats(creature);

        // Make them GENUINELY, mutually faction-hostile so the HUD shows them as enemies (red, not
        // the friendly blue) and the AI engages without needing the excited nudge.
        CombatArena.makeMutuallyHostile(creature, pc, hostileFaction);
        creature.excitedDuration = 10000; // belt-and-suspenders: enter combat immediately

        console.log(`[ARENA] spawned ${resref} ("${creature.getTag()}") faction=${creature.factionId} hostile=${creature.isHostile ? creature.isHostile(pc) : '?'}`);
      } catch (e) {
        console.error(`[ARENA] failed to spawn ${resref}`, e);
      }
    }
  }

  /** Poll until the freshly-loaded module reports it is ready to process events (or times out). */
  static async waitForReady(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    // Date.now is fine here (runtime, not a workflow script).
    while (!(GameState.module && GameState.module.readyToProcessEvents)) {
      if (Date.now() - start > timeoutMs) {
        console.warn('[ARENA] waitForReady timed out');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Poll for the player's death. When the controlled PC's HP drops to 0 (isDead()), show the
   * game-over screen exactly once. The arena PC fights solo, so the PC dying == game over.
   * Self-terminates if the arena is torn down (no module / back at a menu).
   */
  static startDeathWatcher(): void {
    CombatArena.deathHandled = false;
    const timer = setInterval(() => {
      // Stop once we've left the arena (module unloaded or already back at the main menu).
      if (CombatArena.deathHandled || !GameState.module || GameState.Mode === EngineMode.GUI) {
        clearInterval(timer);
        return;
      }
      const pc: any = GameState.getCurrentPlayer();
      if (pc && typeof pc.isDead === 'function' && pc.isDead()) {
        CombatArena.deathHandled = true;
        clearInterval(timer);
        console.log('[ARENA] player has died — game over');
        // Brief delay so the death animation registers before the overlay fades in.
        setTimeout(() => CombatArena.showGameOver(), 1200);
      }
    }, 400);
  }

  /**
   * Show the "YOU HAVE DIED" game-over screen: a self-contained fade-in overlay (K1 has no
   * game-over .gui resource, so this does not depend on a game asset). Returns to the main menu
   * when the button is clicked, or automatically after a few seconds. Falls back to an immediate
   * menu return if there is no DOM (e.g. a headless/non-browser host).
   */
  static showGameOver(): void {
    if (typeof document === 'undefined') { CombatArena.returnToMainMenu(); return; }
    if (document.getElementById('arena-gameover')) return; // idempotent

    const overlay = document.createElement('div');
    overlay.id = 'arena-gameover';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0)', 'transition:background 1.6s ease',
      'font-family:Arial,Helvetica,sans-serif', 'color:#c0392b', 'user-select:none',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'YOU HAVE DIED';
    title.style.cssText = 'font-size:64px;font-weight:bold;letter-spacing:6px;text-shadow:0 0 18px rgba(192,57,43,0.85);opacity:0;transition:opacity 2s ease 0.6s';

    const btn = document.createElement('button');
    btn.textContent = 'Return to Main Menu';
    btn.style.cssText = 'margin-top:48px;padding:14px 36px;font-size:20px;color:#ffd700;background:transparent;border:2px solid #ffd700;border-radius:4px;cursor:pointer;opacity:0;transition:opacity 2s ease 1.2s';
    btn.onmouseenter = () => { btn.style.background = 'rgba(255,215,0,0.15)'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; };
    btn.onclick = () => CombatArena.returnToMainMenu();

    overlay.appendChild(title);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);

    // Kick the CSS transitions on the next frame so they actually animate from the start state.
    const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16);
    raf(() => {
      overlay.style.background = 'rgba(0,0,0,0.86)';
      title.style.opacity = '1';
      btn.style.opacity = '1';
    });

    // Auto-return after a few seconds if the player doesn't click.
    CombatArena.gameOverAutoReturn = setTimeout(() => CombatArena.returnToMainMenu(), 7000) as any;
  }

  /** Pending auto-return timer handle (cleared if the player clicks the button first). */
  static gameOverAutoReturn: any = undefined;

  /**
   * Tear down the arena and return to the main menu — mirrors the in-game options "Quit" path
   * (MenuOptions): unload + dispose the module, reload scripts, reset input, then start MainMenu.
   * Removes the game-over overlay. Idempotent: safe to call from both the button and the timeout.
   */
  static returnToMainMenu(): void {
    if (CombatArena.gameOverAutoReturn) { clearTimeout(CombatArena.gameOverAutoReturn); CombatArena.gameOverAutoReturn = undefined; }

    if (typeof document !== 'undefined') {
      const ov = document.getElementById('arena-gameover');
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    }

    try {
      GameState.UnloadModule();
      GameState.State = EngineState.RUNNING;
      if (GameState.module && typeof (GameState.module as any).dispose === 'function') {
        (GameState.module as any).dispose();
        GameState.module = undefined;
      }
      // Drop all cached scripts + running instances, reset input, then show the main menu.
      NWScript.Reload();
      try { (GameState as any).controls?.initKeys?.(); } catch (e) { /* non-fatal */ }
      GameState.MenuManager.MainMenu.Start();
    } catch (e) {
      console.error('[ARENA] return to main menu failed', e);
    }
  }

  /** Non-blocking watcher that dismisses any OnEnter conversation/cutscene for ~10s. */
  static startDialogSkipWatcher(): void {
    let ticks = 0;
    const timer = setInterval(() => {
      const cm: any = GameState.CutsceneManager;
      if (cm && (cm.active || cm.dialog)) {
        try { cm.endConversation(true); } catch (e) { /* ignore */ }
      }
      if (++ticks > 66) { // ~10s
        clearInterval(timer);
        if (GameState.Mode === EngineMode.DIALOG) {
          GameState.SetEngineMode(EngineMode.INGAME);
        }
      }
    }, 150);
  }
}
