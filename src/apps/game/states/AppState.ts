import * as KotOR from "@/apps/game/KotOR";
import { Launcher } from "@/apps/launcher/context/Launcher";
import { ApplicationEnvironment } from "@/enums/ApplicationEnvironment";
import { GameInitializer } from "@/apps/game/GameInitializer";
import { applyProfileSeo } from "@/apps/common/seo/applyProfileSeo";
import { buildProfileSeo } from "@/apps/common/seo/profileSeo";

export class AppState {
  static eulaAccepted: boolean = false;
  static directoryLocated: boolean = false;
  static gameKey: KotOR.GameEngineType = KotOR.GameEngineType.KOTOR;
  static appProfile: any;
  static env: ApplicationEnvironment;
  static statsMode: number|undefined = undefined;

  /**
   * isWebTest
   * Headless harness mode: navigate to /game/?key=tsl&test=1 to boot the game
   * reading data over HTTP from the dev server (ApplicationEnvironment.WEB_TEST)
   * instead of the File System Access directory picker. See GameFileSystem.ts
   * and webpack/gamedata-middleware.js.
   */
  static isWebTest(): boolean {
    if(typeof window === 'undefined') return false;
    if(window.location.origin === 'file://') return false;
    const q = new URLSearchParams(window.location.search);
    return q.get('test') === '1' || q.get('env') === 'webtest';
  }

  /**
   * getProfile
   * Seeds Profiles.* from built-in launcher definitions when IndexedDB has never seen the launcher
   * (direct navigation to game.html?key=kotor, etc.).
   */
  static async getProfile(){
    const query = new URLSearchParams(window.location.search);
    await KotOR.ConfigClient.Init();
    await Launcher.InitProfiles();
    const rawKey = query.get("key");
    const validKeys = Object.keys(Launcher.AppProfiles || {});
    const key =
      rawKey && validKeys.includes(rawKey) ? rawKey : "kotor";
    if(AppState.isWebTest()){
      // Use the in-memory launcher profile (IndexedDB is empty in a fresh
      // automated browser). No directory_handle — game data comes over HTTP.
      const profile = Object.assign(
        {}, (Launcher.AppProfiles || {})[key] || KotOR.ConfigClient.get(`Profiles.${key}`)
      );
      profile.key = key;
      profile.directory_handle = undefined;
      return profile;
    }
    return KotOR.ConfigClient.get(`Profiles.${key}`);
  }

  /**
   * initApp
   */
  static async initApp(){
    if(window.location.origin === 'file://'){
      AppState.env = ApplicationEnvironment.ELECTRON;
    }else if(AppState.isWebTest()){
      AppState.env = ApplicationEnvironment.WEB_TEST;
    }else{
      AppState.env = ApplicationEnvironment.BROWSER;
    }

    AppState.appProfile = await AppState.getProfile();
    KotOR.ApplicationProfile.SetProfile(AppState.appProfile);
    KotOR.ApplicationProfile.InitEnvironment();
    if(AppState.env == ApplicationEnvironment.WEB_TEST){
      // InitEnvironment() resets ENV to BROWSER from window.location; force WEB_TEST back.
      KotOR.ApplicationProfile.ENV = ApplicationEnvironment.WEB_TEST;
      // Turn on the engine-side test event bus / deterministic-time hooks (no-op in normal play).
      KotOR.TestHarness.enabled = true;
    }

    applyProfileSeo(buildProfileSeo(AppState.appProfile, {
      appPath: '/game/',
      profileKey: AppState.appProfile.key || 'kotor',
    }));
    
    switch(AppState.appProfile.launch.args.gameChoice){
      case 2:
        AppState.gameKey = KotOR.GameEngineType.TSL;
      break;
      default:
        AppState.gameKey = KotOR.GameEngineType.KOTOR;
      break;
    }

    const eulaState: any = Object.assign({}, JSON.parse(window.localStorage.getItem('acceptEULA') as string));
    const gameEULAConfig = Object.assign({
      key: AppState.gameKey,
      version: null,
      date: null,
      accepted: false
    }, eulaState[AppState.gameKey]);
    eulaState[AppState.gameKey] = gameEULAConfig;
    // Headless test mode auto-accepts the EULA so it boots straight into the game.
    AppState.eulaAccepted = !!gameEULAConfig.accepted || (AppState.env == ApplicationEnvironment.WEB_TEST);
    window.localStorage.setItem('acceptEULA', JSON.stringify(eulaState));

    AppState.loaderShow();

    console.log('gameEULAConfig', gameEULAConfig);
    console.log('eulaState', eulaState);
    AppState.directoryLocated = await AppState.checkGameDirectory();
    if(AppState.eulaAccepted){
      await AppState.loadGameDirectory();
    }
    AppState.processEventListener('on-ready', [AppState.eulaAccepted]);
  }

  /**
   * acceptEULA
   */
  static async acceptEULA(){
    AppState.eulaAccepted = true;
    await AppState.loadGameDirectory();
    AppState.processEventListener('on-preload', []);
  }

  /**
   * loadGameDirectory
   * - Used for Electron and Browser
   */
  static async loadGameDirectory(){
    AppState.loaderShow();
    GameInitializer.SetLoadingMessage('Locating Game Directory...');

    if(AppState.env == ApplicationEnvironment.WEB_TEST){
      if(await KotOR.GameFileSystem.exists('chitin.key')){
        AppState.directoryLocated = true;
        AppState.processEventListener('on-preload', []);
        AppState.beginGame();
        return;
      }
      console.error('WEB_TEST: chitin.key not found over HTTP. Is the dev-server gamedata middleware pointed at your game install (KOTOR2_DIR)?');
      AppState.directoryLocated = false;
      AppState.processEventListener('on-preload', []);
      return;
    }

    if(AppState.env == ApplicationEnvironment.ELECTRON){
      if(await KotOR.GameFileSystem.exists('chitin.key')){
        AppState.directoryLocated = true;
        AppState.processEventListener('on-preload', []);
        AppState.beginGame();
        return;
      }
      alert('Unable to locate chitin.key in the selected directory. Please try again.');
    }else{
      if(KotOR.ApplicationProfile.directoryHandle){
        const validated = await AppState.validateDirectoryHandle(KotOR.ApplicationProfile.directoryHandle);
        if(validated && await KotOR.GameFileSystem.exists('chitin.key')){
          AppState.directoryLocated = true;
          AppState.processEventListener('on-preload', []);
          AppState.beginGame();
          return;
        }
        alert('Unable to locate chitin.key in the selected directory. Please try again.');
      }
    }
    AppState.directoryLocated = false;
    AppState.processEventListener('on-preload', []);
  }

  /**
   * checkGameDirectory
   * - Used for Electron and Browser
   */
  static async checkGameDirectory(){
    if(AppState.env == ApplicationEnvironment.WEB_TEST){
      return await KotOR.GameFileSystem.exists('chitin.key');
    }
    if(AppState.env == ApplicationEnvironment.ELECTRON){
      if(await KotOR.GameFileSystem.exists('chitin.key')){
        return true;
      }
    }else{
      if(KotOR.ApplicationProfile.directoryHandle){
        const validated = await AppState.validateDirectoryHandle(KotOR.ApplicationProfile.directoryHandle);
        if(validated && await KotOR.GameFileSystem.exists('chitin.key')){
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Initializes the loading screen
   */
  static loaderInit(backgroundURL: string, logoURL: string): void {
    AppState.processEventListener('on-loader-init', [backgroundURL, logoURL]);
  }

  /**
   * Shows the loading screen
   */
  static loaderShow(){
    AppState.processEventListener('on-loader-show', []);
  }

  /**
   * Hides the loading screen
   */
  static loaderHide(){
    AppState.processEventListener('on-loader-hide', []);
  }

  /**
   * Sets the loading screen message
   */
  static loaderMessage(message: string): void {
    AppState.processEventListener('on-loader-message', [message]);
  }

  /**
   * beginGame
   */
  static async beginGame(){
    KotOR.ApplicationProfile.ENV = AppState.env;
    if(AppState.env == ApplicationEnvironment.ELECTRON){
      KotOR.ApplicationProfile.directory = AppState.appProfile.directory;
    }else{
      KotOR.ApplicationProfile.directoryHandle = AppState.appProfile.directory_handle;
    }
    console.log('loading game...');
    AppState.loaderInit(AppState.appProfile.background, AppState.appProfile.logo);
    AppState.loaderShow();
    KotOR.GameState.GameKey = AppState.gameKey;
    KotOR.TextureLoader.GameKey = KotOR.GameState.GameKey;
    GameInitializer.AddEventListener('on-loader-message', (message: string) => {
      AppState.loaderMessage(message);
    });
    GameInitializer.AddEventListener('on-loader-show', () => {
      AppState.loaderShow();
    });
    GameInitializer.AddEventListener('on-loader-hide', () => {
      AppState.loaderHide();
    });

    await GameInitializer.Init(AppState.gameKey);

    console.log('loaded')
    KotOR.GUIListBox.InitTextures();
    KotOR.OdysseyWalkMesh.Init();
    KotOR.GameState.setDOMElement(document.getElementById('renderer-container') as HTMLElement);

    window.addEventListener('blur', (e) => {
      KotOR.AudioEngine.OnWindowFocusChange(false);
    });

    window.addEventListener('focus', (e) => {
      KotOR.AudioEngine.OnWindowFocusChange(true);
    });

    AppState.processEventListener('on-game-loaded', []);
    
    AppState.loaderMessage('GameState: Initializing...');
    await KotOR.GameState.Init();
    document.body.append(KotOR.GameState.stats.domElement);
    console.log('init complete');

    // WEB_TEST quick-start: ?module=<resref> jumps straight into a level with a
    // provisioned default PC, skipping chargen and the prologue entirely.
    if(AppState.env == ApplicationEnvironment.WEB_TEST){
      (window as any).AppState = AppState; // expose for programmatic harness driving
      const q = new URLSearchParams(window.location.search);
      const quickModule = q.get('module');
      if(quickModule){
        await AppState.quickStart(quickModule, q.get('waypoint') || '');
        AppState.loaderHide();
        return;
      }
    }

    AppState.loaderHide();
  }

  /**
   * quickStart (WEB_TEST harness)
   * Provision a default player character and jump straight into a module —
   * skipping character creation and the prologue. Callable from the URL
   * (?module=101PER[&waypoint=...]) or programmatically: window.AppState.quickStart('101PER').
   *
   * NOTE: this does not replay story decisions/journal/globals, so module scripts
   * that depend on prior plot state may not behave exactly as in a real playthrough
   * — it is meant for testing areas, combat, and UI, not narrative continuity.
   */
  static async quickStart(moduleName: string, waypoint: string = ''){
    try{
      const PM = KotOR.GameState.PartyManager;
      const template = PM.GeneratePlayerTemplate();
      PM.PlayerTemplate = template;
      PM.ActualPlayerTemplate = template;
      // Register the PC's portrait so it lands in the party/HUD correctly.
      try{
        const pc = new KotOR.GameState.Module.ModuleArea.ModulePlayer(template);
        pc.load();
        PM.AddPortraitToOrder(pc.getPortraitResRef());
      }catch(e){ console.warn('quickStart: portrait setup skipped', e); }

      KotOR.GameState.GlobalVariableManager.Init();
      await KotOR.CurrentGame.InitGameInProgressFolder(true);
      await KotOR.GameState.LoadModule(moduleName, waypoint || undefined as any);

      // Many modules auto-start an OnEnter conversation/cutscene that expects story
      // state we didn't provision (it renders as a black DIALOG screen). Skip it so
      // we land in a playable INGAME state. The OnEnter script fires asynchronously
      // only once gameplay ticks begin (after this returns and the loader hides), so
      // use a non-blocking watcher that ends any conversation that appears within a
      // window and re-skips if it retriggers.
      if(new URLSearchParams(window.location.search).get('keepDialog') !== '1'){
        let ticks = 0;
        const skipTimer = setInterval(() => {
          const cm = KotOR.GameState.CutsceneManager;
          if(cm && (cm.active || cm.dialog)){
            try{ cm.endConversation(true); }catch(e){ console.warn('quickStart: endConversation failed', e); }
          }
          if(++ticks > 66){ // ~10s
            clearInterval(skipTimer);
            if(KotOR.GameState.Mode === KotOR.EngineMode.DIALOG){
              KotOR.GameState.SetEngineMode(KotOR.EngineMode.INGAME);
            }
          }
        }, 150);
      }
      console.log(`quickStart: loaded module ${moduleName}`);
    }catch(e){
      console.error(`quickStart: failed to load module ${moduleName}`, e);
    }
  }

  /**
   * attachDirectoryPath
   * - Used for Electron
   */
  static attachDirectoryPath(path: string){
    KotOR.ConfigClient.set(`Profiles.${AppState.appProfile.key}.directory`, path);
    AppState.appProfile.directory = path;
    AppState.directoryLocated = true;
    AppState.loadGameDirectory();
  }

  /**
   * attachDirectoryHandle
   * - Used for Browser
   */
  static async attachDirectoryHandle(handle: FileSystemDirectoryHandle){
    KotOR.ApplicationProfile.directoryHandle = handle;
    KotOR.ConfigClient.set(`Profiles.${AppState.appProfile.key}.directory_handle`, handle);
    AppState.directoryLocated = true;
    AppState.loadGameDirectory();
  }

  /**
   * validateDirectoryHandle
   * - Used for Browser
   */
  static async validateDirectoryHandle(handle: FileSystemDirectoryHandle){
    try{
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        return true;
      }
      return false;
    }catch(e){
      console.error(e);
      return false;
    }
  }

  static consoleCommand(command: string){
    console.log('consoleCommand', command);
    KotOR.GameState.CheatConsoleManager.processCommand(command);
  }

  static togglePerformanceMonitor(){
    let mode: number|undefined = AppState.statsMode;
    if(mode == undefined){
      mode = 0;
    }else{
      mode++;
    }
    if(mode > 2){
      mode = undefined;
    }
    AppState.statsMode = mode;
    KotOR.GameState.stats.showPanel(mode as any);
  }

  static toggleDebugger(){
    KotOR.GameState.Debugger.open();
  }

  static reloadLastSave(){
    const gameKey = KotOR.GameState.GameKey;
    const lastSaveId = parseInt(localStorage.getItem(`${gameKey}_last_save_id`) || '-1');
    const saveGame = KotOR.SaveGame.saves[lastSaveId];
    if(!saveGame){ return; }
    saveGame.load();
  }

  /**
   * Event Listeners
   */

  static #eventListeners: any = {};

  static addEventListener<T>(type: T, cb: Function): void {
    if(!Array.isArray(this.#eventListeners[type])){
      this.#eventListeners[type] = [];
    }
    if(Array.isArray(this.#eventListeners[type])){
      let ev = this.#eventListeners[type];
      let index = ev.indexOf(cb);
      if(index == -1){
        ev.push(cb);
      }else{
        console.warn('Event Listener: Already added', type);
      }
    }else{
      console.warn('Event Listener: Unsupported', type);
    }
  }

  static removeEventListener<T>(type: T, cb: Function): void {
    if(Array.isArray(this.#eventListeners[type])){
      let ev = this.#eventListeners[type];
      let index = ev.indexOf(cb);
      if(index >= 0){
        ev.splice(index, 1);
      }else{
        console.warn('Event Listener: Already removed', type);
      }
    }else{
      console.warn('Event Listener: Unsupported', type);
    }
  }

  static processEventListener<T>(type: T, args: any[] = []): void {
    if(Array.isArray(this.#eventListeners[type])){
      let ev = this.#eventListeners[type];
      for(let i = 0; i < ev.length; i++){
        const callback = ev[i];
        if(typeof callback === 'function'){
          callback(...args);
        }
      }
    }else{
      console.warn('Event Listener: Unsupported', type);
    }
  }

}
