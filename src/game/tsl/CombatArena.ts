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
 * CombatArena (TSL / KotOR II test harness).
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * A developer/QA entry point (wired to the otherwise-unused BTN_WARP slot on the TSL
 * main menu, relabelled "Combat Arena") that jumps straight into a combat sandbox:
 *  - boots a fully-kitted Jedi player character (lightsaber + all Force powers + high HP/FP),
 *  - loads a RANDOM KotOR II module to use as the arena and strips its own encounters/scripts,
 *  - spawns hostile enemies CLONED from that module's own creature blueprints in front of the
 *    player (so it works for any module, without hard-coding game-specific enemy resrefs).
 *
 * It is a test tool only — it does not provision story/journal/global state. Mirrors the K1
 * CombatArena but is module-agnostic so it can drop into any K2 area.
 *
 * @file CombatArena.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CombatArena {
  /**
   * Candidate KotOR II arena modules — open combat areas that ship with hostile creatures
   * (Peragus droids, Telos mercs/Handmaidens, Nar Shaddaa thugs, Dxun Mandalorians/beasts,
   * Onderon soldiers, Korriban). Launch() picks one at random and falls through to the next
   * if a pick fails to load or has no creatures to clone.
   */
  static MODULES = [
    '103PER', '105PER', '106PER',       // Peragus mining tunnels (droids)
    '232TEL', '262TEL',                 // Telos (Czerka mercs / polar academy)
    '303NAR', '305NAR',                 // Nar Shaddaa (Exchange thugs)
    '401DXN', '402DXN', '403DXN',       // Dxun jungle (Mandalorians / cannoks)
    '501OND', '506OND',                 // Onderon
    '701KOR',                           // Korriban
  ];

  /** Global fallback enemy blueprints if the chosen module yields no creatures to clone. */
  static FALLBACK_ENEMIES = ['g_assassindrd01', 'g_assassindrd02', 'g_assassindrd03'];

  /** How many enemies to spawn for the fight. */
  static ENEMY_COUNT = 4;

  /** Starting alignment for the test PC (GoodEvil: 0 = pure dark .. 50 = neutral .. 100 = pure light). */
  static PC_ALIGNMENT = 50;

  /** Lazily-resolved faction id that is hostile to the player. */
  static hostileFactionId = -1;

  /** Guard so the death -> game-over -> menu flow runs exactly once per arena session. */
  static deathHandled = false;

  /** The module chosen for the current session (for logging / re-rolls). */
  static currentModule = '';

  /** Pending game-over auto-return timer handle. */
  static gameOverAutoReturn: any = undefined;

  /**
   * Launch the combat arena. Safe to call from the main menu (no game in progress).
   */
  static async Launch(): Promise<void> {
    try {
      console.log('[K2-ARENA] Launching combat test arena...');

      // 1) Provision a fully-kitted Jedi PC.
      const PM = GameState.PartyManager;
      const template = CombatArena.generateJediTemplate();
      PM.PlayerTemplate = template;
      PM.ActualPlayerTemplate = template;
      try {
        const pc = new GameState.Module.ModuleArea.ModulePlayer(template);
        pc.load();
        PM.AddPortraitToOrder(pc.getPortraitResRef());
      } catch (e) { console.warn('[K2-ARENA] portrait setup skipped', e); }

      GameState.GlobalVariableManager.Init();
      await CurrentGame.InitGameInProgressFolder(true);

      // 2) Load a random arena module (retry a couple of times on failure).
      const module = await CombatArena.loadRandomModule();
      if (!module) { console.error('[K2-ARENA] no module could be loaded'); return; }

      // Kill the area's OnEnter/OnHeartbeat before the first tick can run the intro, with a
      // dialog-skip watcher as backup.
      CombatArena.disableAreaScripts();
      CombatArena.startDialogSkipWatcher();

      // 3) Wait for the area to be fully ready.
      await CombatArena.waitForReady();

      // 4) Capture the module's own creature blueprints to use as the enemy pool, then strip
      //    the module's placed creatures/encounters.
      const enemyResRefs = CombatArena.captureEnemyResRefs();
      CombatArena.cleanArena();

      // 5) Kit the player.
      CombatArena.kitPlayer();

      // 6) Move the player off the module's entry (often a cramped elevator/door transition)
      //    into the most OPEN part of the area so there is room to actually fight.
      CombatArena.repositionToOpenSpot();

      // 7) Spawn hostile enemies around the player.
      await CombatArena.spawnEnemies(enemyResRefs);

      if (GameState.Mode === EngineMode.DIALOG) {
        GameState.SetEngineMode(EngineMode.INGAME);
      }

      // 7) Watch for the player's death -> game over -> main menu.
      CombatArena.startDeathWatcher();

      console.log(`[K2-ARENA] Combat arena ready in ${CombatArena.currentModule}.`);
    } catch (e) {
      console.error('[K2-ARENA] Launch failed', e);
    }
  }

  /** Load a random module from MODULES, trying others if one fails. Returns the loaded module or null. */
  static async loadRandomModule(): Promise<any> {
    const order = CombatArena.shuffle(CombatArena.MODULES.slice());
    for (const resref of order) {
      try {
        console.log(`[K2-ARENA] loading module ${resref}...`);
        await GameState.LoadModule(resref);
        await CombatArena.waitForReady(12000);
        if (GameState.module && GameState.module.area) {
          CombatArena.currentModule = resref;
          return GameState.module;
        }
      } catch (e) {
        console.warn(`[K2-ARENA] module ${resref} failed to load, trying another`, e);
      }
    }
    return null;
  }

  /** In-place Fisher-Yates shuffle (Math.random is fine here — runtime, not a workflow script). */
  static shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Build a player template flipped to a high-level Jedi (spellcaster) class with a large HP/Force
   * pool. The base template already equips a lightsaber + Jedi robe, so no manual item wiring needed.
   */
  static generateJediTemplate(): GFFObject {
    const tpl = GameState.PartyManager.GeneratePlayerTemplate();
    const root = tpl.RootNode;

    const setVal = (label: string, value: number, type: GFFDataType = GFFDataType.SHORT) => {
      let f = root.getFieldByLabel(label);
      if (!f) f = root.addField(new GFFField(type, label));
      f.setValue(value);
    };

    const jediClassId = CombatArena.findJediClassId();
    try {
      const classList = root.getFieldByLabel('ClassList');
      const cls = classList ? classList.getChildStructs()[0] : undefined;
      if (cls) {
        cls.getFieldByLabel('Class').setValue(jediClassId);
        cls.getFieldByLabel('ClassLevel').setValue(15);
      }
    } catch (e) { console.warn('[K2-ARENA] could not set Jedi class', e); }

    setVal('HitPoints', 300);
    setVal('MaxHitPoints', 300);
    setVal('CurrentHitPoints', 300);
    setVal('ForcePoints', 200);
    setVal('MaxForcePoints', 200);
    setVal('CurrentForce', 200);

    setVal('Str', 16);
    setVal('Dex', 16);
    setVal('Con', 16);
    setVal('Wis', 16);
    setVal('Cha', 14);

    setVal('GoodEvil', CombatArena.PC_ALIGNMENT);

    return tpl;
  }

  /** Find a Jedi (spellcaster) class id from classes.2da; falls back to row 3. */
  static findJediClassId(): number {
    try {
      const classes = GameState.TwoDAManager.datatables.get('classes');
      const rows: any = classes?.rows || {};
      const count = classes?.RowCount || 0;
      for (let i = 0; i < count; i++) {
        const label = `${rows[i]?.label ?? ''}`.toLowerCase();
        if (label.includes('guardian')) return i;
      }
      for (let i = 0; i < count; i++) {
        const sc = `${rows[i]?.spellcaster ?? ''}`.toLowerCase();
        if (sc === '1' || sc === 'true') return i;
      }
    } catch (e) { console.warn('[K2-ARENA] findJediClassId failed', e); }
    return 3;
  }

  /** Top up the live PC's HP/FP, set alignment, grant the melee moveset + every Force power. */
  static kitPlayer(): void {
    const pc: any = GameState.getCurrentPlayer();
    if (!pc) { console.warn('[K2-ARENA] no player to kit'); return; }

    pc.hitPoints = 300; pc.maxHitPoints = 300; pc.currentHitPoints = 300;
    pc.forcePoints = 200; pc.maxForcePoints = 200; pc.currentForce = 200;
    pc.min1HP = false;
    pc.goodEvil = CombatArena.PC_ALIGNMENT;

    CombatArena.grantMeleeFeats(pc);

    const cls: any = pc.classes && pc.classes[0];
    let granted = 0;
    if (cls && typeof cls.addSpell === 'function') {
      try {
        const spells = GameState.TwoDAManager.datatables.get('spells');
        const rows: any = spells?.rows || {};
        const count = spells?.RowCount || 0;
        const existing = new Set((cls.getSpells?.() || []).map((s: any) => s.id));
        for (let i = 0; i < count; i++) {
          const row = rows[i];
          const fp = parseInt(row?.forcepoints);
          const name = parseInt(row?.name);
          if (!isNaN(fp) && fp > 0 && !isNaN(name) && name >= 0 && !existing.has(i)) {
            try { cls.addSpell(new GameState.TalentSpell(i)); existing.add(i); granted++; } catch (e) { /* skip bad row */ }
          }
        }
      } catch (e) { console.warn('[K2-ARENA] granting Force powers failed', e); }
    }
    console.log(`[K2-ARENA] PC kitted: HP ${pc.getHP?.()}/${pc.getMaxHP?.()} FP ${pc.forcePoints}, ${granted} Force powers`);
  }

  /**
   * Grant a creature the full melee attack-form moveset + supporting passives (K2 feat ids).
   * Granting these to the spawned enemies (not just the PC) lets the combat AI fight back with
   * the dump-driven attack forms (Power Attack / Flurry / Critical Strike).
   */
  static grantMeleeFeats(creature?: any): void {
    const who: any = creature || GameState.getCurrentPlayer();
    if (!who || typeof who.addFeat !== 'function') { return; }

    let granted = 0;
    const give = (id: number) => {
      if (typeof id !== 'number' || isNaN(id) || id < 0) return;
      if (typeof who.getHasFeat === 'function' && who.getHasFeat(id)) return;
      try { who.addFeat(id); granted++; } catch (e) { /* skip absent feat row */ }
    };

    // K2 melee attack forms, every tier: Power Attack 28/17/83, Flurry 11/91/53,
    // Critical Strike 8/19/81 (the dump-verified ids).
    [28, 17, 83, 11, 91, 53, 8, 19, 81].forEach(give);
    // Passive melee competence: lightsaber + melee proficiency/focus/specialization,
    // two-weapon line, Toughness.
    [43, 36, 50, 44, 37, 51, 3, 9, 85, 84].forEach(give);

    // Safety net: any other category-0x1104 melee attack form the data defines.
    try {
      const feat = GameState.TwoDAManager.datatables.get('feat');
      const count = feat?.RowCount || 0;
      for (let i = 0; i < count; i++) {
        if (typeof who.getHasFeat === 'function' && who.getHasFeat(i)) continue;
        let category = -1;
        try { category = new GameState.TalentFeat(i).category; } catch (e) { continue; }
        if (category === 0x1104) give(i);
      }
    } catch (e) { /* best effort */ }

    const label = (who === GameState.getCurrentPlayer()) ? 'PC' : (who.getTag ? who.getTag() : 'creature');
    console.log(`[K2-ARENA] ${label} granted ${granted} melee feats`);
  }

  /** Collect up to a handful of distinct creature blueprint resrefs from the loaded module. */
  static captureEnemyResRefs(): string[] {
    const area: any = GameState.module?.area;
    const resrefs: string[] = [];
    if (area && Array.isArray(area.creatures)) {
      for (const c of area.creatures) {
        try {
          const rr = typeof c.getTemplateResRef === 'function' ? c.getTemplateResRef() : c.templateResRef;
          if (rr && resrefs.indexOf(rr) === -1) resrefs.push(rr);
        } catch (e) { /* skip */ }
        if (resrefs.length >= 6) break;
      }
    }
    if (!resrefs.length) {
      console.warn(`[K2-ARENA] ${CombatArena.currentModule} had no creatures to clone; using fallback enemies`);
      return CombatArena.FALLBACK_ENEMIES.slice();
    }
    console.log(`[K2-ARENA] enemy pool from ${CombatArena.currentModule}: ${resrefs.join(', ')}`);
    return resrefs;
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

  /** Remove the module's own creatures/encounters and disable its area scripts. */
  static cleanArena(): void {
    const area: any = GameState.module?.area;
    if (!area) return;
    CombatArena.disableAreaScripts();
    try {
      let guard = 0;
      while (area.creatures.length && guard++ < 512) area.creatures[0].destroy();
    } catch (e) { console.warn('[K2-ARENA] clearing creatures failed', e); }
    try {
      while (area.encounters && area.encounters.length) {
        const enc = area.encounters[0];
        if (typeof enc?.destroy === 'function') enc.destroy();
        area.encounters.splice(0, 1);
      }
    } catch (e) { /* best effort */ }

    // Drop any timed events the stripped module already scheduled (creature heartbeats etc.).
    // Left in place they fire on the now-destroyed creatures and crash the frame loop in
    // clearAllActions. Our spawned enemies re-schedule their own heartbeats after this.
    try {
      const mod: any = GameState.module;
      if (mod && Array.isArray(mod.eventQueue)) mod.eventQueue.length = 0;
    } catch (e) { /* best effort */ }
  }

  /** Resolve a faction id hostile to the player (reputation <= 10 toward faction 0); falls back to 1. */
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
    } catch (e) { /* best effort */ }
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
    setRep(creature.faction, pcFactionId);
    setRep(pc && pc.faction, hostileFactionId);
  }

  /** Facing angle (engine convention: forward = (-sin f, cos f)) so an object at `from` looks at `to`. */
  static facingToward(from: any, to: any): number {
    return Math.atan2(-(to.x - from.x), (to.y - from.y));
  }

  /**
   * Find the most OPEN walkable point in the area: the walkable-face centroid that is
   * furthest from any walkmesh perimeter edge (area.scorePointEdgeDistance). That is the
   * middle of the biggest open room — an actual fighting space rather than the entry
   * elevator/corridor the module drops the player in. Samples up to ~300 faces for speed.
   * Uses the PC's position vector as a scratch THREE.Vector3 (no THREE import needed).
   */
  static findOpenSpot(pc: any): any {
    const area: any = GameState.module?.area;
    if (!pc || !area || !Array.isArray(area.walkFaces) || !area.walkFaces.length) return null;
    if (typeof area.scorePointEdgeDistance !== 'function') return null;

    const faces = area.walkFaces;
    const stride = Math.max(1, Math.floor(faces.length / 300));
    const probe = pc.position.clone();
    let best: any = null;
    let bestScore = -Infinity;
    for (let i = 0; i < faces.length; i += stride) {
      const t = faces[i] && faces[i].triangle;
      if (!t || !t.a || !t.b || !t.c) continue;
      probe.set((t.a.x + t.b.x + t.c.x) / 3, (t.a.y + t.b.y + t.c.y) / 3, (t.a.z + t.b.z + t.c.z) / 3);
      let score = 0;
      try { score = area.scorePointEdgeDistance(probe); } catch (e) { continue; }
      if (score > bestScore) { bestScore = score; best = probe.clone(); }
    }
    if (best) console.log(`[K2-ARENA] open spot clearance ~${bestScore === Infinity ? 'inf' : bestScore.toFixed(1)}u`);
    return best;
  }

  /** Teleport the player to the most open spot in the area (see findOpenSpot). */
  static repositionToOpenSpot(): void {
    const pc: any = GameState.getCurrentPlayer();
    if (!pc) return;
    const spot = CombatArena.findOpenSpot(pc);
    if (!spot) { console.warn('[K2-ARENA] no open spot found; staying at module entry'); return; }
    pc.position.copy(spot);
    try { pc.getCurrentRoom?.(); } catch (e) { /* non-fatal */ }
    try { pc.computeBoundingBox?.(); } catch (e) { /* non-fatal */ }
    console.log(`[K2-ARENA] moved PC to open spot (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}, ${spot.z.toFixed(1)})`);
  }

  /** Spawn hostile enemy copies in a small arc in front of the player, snapped to the walkmesh. */
  static async spawnEnemies(resrefs: string[]): Promise<void> {
    const pc: any = GameState.getCurrentPlayer();
    const area: any = GameState.module?.area;
    if (!pc || !area || !resrefs.length) { console.warn('[K2-ARENA] cannot spawn enemies'); return; }

    const hostileFaction = CombatArena.resolveHostileFaction();
    const pcPos = pc.position.clone();
    const facing = pc.rotation ? pc.rotation.z : 0;
    // Forward unit vector of the PC, and its right-hand perpendicular, to fan enemies out ahead.
    const fwdX = -Math.sin(facing), fwdY = Math.cos(facing);
    const rightX = Math.cos(facing), rightY = Math.sin(facing);

    for (let i = 0; i < CombatArena.ENEMY_COUNT; i++) {
      const resref = resrefs[i % resrefs.length];
      let buffer = ResourceLoader.loadCachedResource(ResourceTypes['utc'], resref);
      if (!buffer) {
        try { buffer = await ResourceLoader.loadResource(ResourceTypes['utc'], resref); } catch (e) { /* not found */ }
      }
      if (!buffer) { console.warn(`[K2-ARENA] enemy blueprint not found: ${resref}`); continue; }
      try {
        const creature: any = new GameState.Module.ModuleArea.ModuleCreature(new GFFObject(buffer));
        creature.load();
        creature.clearAllActions();
        creature.min1HP = false;

        const lateral = (i - (CombatArena.ENEMY_COUNT - 1) / 2) * 2.2;
        const ahead = 4 + (i % 2) * 1.6;
        const desired = pcPos.clone().set(
          pcPos.x + fwdX * ahead + rightX * lateral,
          pcPos.y + fwdY * ahead + rightY * lateral,
          pcPos.z,
        );
        const spot = (typeof area.getNearestWalkablePoint === 'function')
          ? area.getNearestWalkablePoint(desired, 2.0) || desired
          : desired;
        creature.position.set(spot.x, spot.y, spot.z);
        creature.setFacing(CombatArena.facingToward(creature.position, pcPos), true);

        area.attachObject(creature);
        const model = await creature.loadModel();
        creature.model.userData.moduleObject = creature;
        model.hasCollision = true;
        model.name = creature.getTag();
        GameState.group.creatures.add(creature.container);

        creature.getCurrentRoom();
        try { creature.computeBoundingBox(); } catch (e) { /* non-fatal */ }
        creature.onSpawn();

        CombatArena.grantMeleeFeats(creature);
        CombatArena.makeMutuallyHostile(creature, pc, hostileFaction);
        creature.excitedDuration = 10000;

        console.log(`[K2-ARENA] spawned ${resref} ("${creature.getTag()}") hostile=${creature.isHostile ? creature.isHostile(pc) : '?'}`);
      } catch (e) {
        console.error(`[K2-ARENA] failed to spawn ${resref}`, e);
      }
    }
  }

  /** Poll until the freshly-loaded module reports it is ready to process events (or times out). */
  static async waitForReady(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (!(GameState.module && GameState.module.readyToProcessEvents)) {
      if (Date.now() - start > timeoutMs) { console.warn('[K2-ARENA] waitForReady timed out'); return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Poll for the player's death and show the game-over screen exactly once. */
  static startDeathWatcher(): void {
    CombatArena.deathHandled = false;
    const timer = setInterval(() => {
      if (CombatArena.deathHandled || !GameState.module || GameState.Mode === EngineMode.GUI) {
        clearInterval(timer);
        return;
      }
      const pc: any = GameState.getCurrentPlayer();
      if (pc && typeof pc.isDead === 'function' && pc.isDead()) {
        CombatArena.deathHandled = true;
        clearInterval(timer);
        console.log('[K2-ARENA] player has died — game over');
        setTimeout(() => CombatArena.showGameOver(), 1200);
      }
    }, 400);
  }

  /** Show a self-contained "YOU HAVE DIED" overlay (no game-over .gui dependency). */
  static showGameOver(): void {
    if (typeof document === 'undefined') { CombatArena.returnToMainMenu(); return; }
    if (document.getElementById('arena-gameover')) return;

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

    const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16);
    raf(() => { overlay.style.background = 'rgba(0,0,0,0.86)'; title.style.opacity = '1'; btn.style.opacity = '1'; });

    CombatArena.gameOverAutoReturn = setTimeout(() => CombatArena.returnToMainMenu(), 7000) as any;
  }

  /** Tear down the arena and return to the main menu. Idempotent. */
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
      NWScript.Reload();
      try { (GameState as any).controls?.initKeys?.(); } catch (e) { /* non-fatal */ }
      GameState.MenuManager.MainMenu.Start();
    } catch (e) {
      console.error('[K2-ARENA] return to main menu failed', e);
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
      if (++ticks > 66) {
        clearInterval(timer);
        if (GameState.Mode === EngineMode.DIALOG) GameState.SetEngineMode(EngineMode.INGAME);
      }
    }, 150);
  }
}
