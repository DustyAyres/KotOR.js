/**
 * ApplicationEnvironment enum.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file ApplicationEnvironment.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 * @enum
 */
export enum ApplicationEnvironment {
  BROWSER = "BROWSER",
  ELECTRON = "ELECTRON",
  // Headless test mode: read game data over HTTP from the dev server instead of
  // the File System Access API, so the browser build can be driven automatically.
  WEB_TEST = "WEB_TEST",
}
