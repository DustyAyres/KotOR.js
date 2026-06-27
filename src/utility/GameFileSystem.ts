import * as path from "path";
import * as fs from "fs";
import { ApplicationProfile } from "@/utility/ApplicationProfile";
import { ApplicationEnvironment } from "@/enums/ApplicationEnvironment";
import { IGameFileSystemReadDirOptions } from "@/interface/filesystem/IGameFileSystemReadDirOptions";
declare const dialog: any;

const webHandleHasRemove = typeof (FileSystemFileHandle.prototype as any).remove === 'function'

const spleep = (time: number = 0) => {
  return new Promise( (resolve, reject) => {
    setTimeout(resolve, time);
  });
}

/**
 * GameFileSystem class.
 * 
 * Handles file system access for the application.
 * It will use either the File System Access API or the fs module built into node
 * depending on the ENVIRONMENT ( BROWSER|ELECTRON ) the app was loaded under.
 * 
 * This class should only access the directory that the user supplied and not escape it.
 * Under the web this is forced, but the node implementation is not so strict.
 * 
 * This class will also be able to access sub files and folders of the supplied directory.
 * 
 * File access outside of this usecase should be delagated to calling the open/save file dialogs
 * when the user requests them.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file GameFileSystem.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class GameFileSystem {

  private static normalizePath(filepath: string){
    filepath = filepath.trim();
    filepath = filepath.replace(/^\/+/, '').replace(/\/+$/, '');
    filepath = filepath.replace(/^\\+/, '').replace(/\\+$/, '');
    return filepath;
  }

  /**
   * WEB_TEST headless harness helpers.
   *
   * In ApplicationEnvironment.WEB_TEST the engine reads/writes game data over
   * HTTP from the dev server (see webpack/gamedata-middleware.js) instead of the
   * File System Access API, so the browser build can be driven without the
   * directory picker. Reads come from the user's real install (read-only);
   * writes (saves, gameinprogress) are redirected to a server-side scratch dir
   * so the install is never mutated.
   */
  private static isWebTest(): boolean {
    return ApplicationProfile.ENV == ApplicationEnvironment.WEB_TEST;
  }

  // Encode a game-relative path for the GET /gamedata/<path> file route,
  // preserving '/' separators between segments.
  private static webTestFileUrl(filepath: string): string {
    const p = this.normalizePath(filepath);
    return '/gamedata/' + p.split('/').map(encodeURIComponent).join('/');
  }

  // Build a metadata/write endpoint URL with the path passed as a query param.
  private static webTestMetaUrl(endpoint: string, filepath: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    params.set('path', this.normalizePath(filepath));
    for(const k of Object.keys(extra)) params.set(k, extra[k]);
    return endpoint + '?' + params.toString();
  }

  /**
   * WEB_TEST fetch concurrency gate.
   *
   * The engine issues large bursts of resource reads (e.g. every entry in a BIF
   * archive). Firing thousands of fetch()es at once makes Chrome reject them with
   * net::ERR_INSUFFICIENT_RESOURCES, which silently corrupts loads (e.g. a missing
   * keymap.2da later crashes KeyMapper). We cap in-flight requests and retry the
   * transient failures so loads are deterministic.
   */
  private static readonly webTestMaxConcurrent = 16;
  private static webTestActive = 0;
  private static webTestWaiters: Array<() => void> = [];

  private static async webTestAcquire(): Promise<void> {
    if(this.webTestActive < this.webTestMaxConcurrent){
      this.webTestActive++;
      return;
    }
    // Wait for a slot; release() hands the slot off without changing the count.
    await new Promise<void>(resolve => this.webTestWaiters.push(resolve));
  }

  private static webTestReleaseSlot(): void {
    const next = this.webTestWaiters.shift();
    if(next){
      next(); // hand our slot to the next waiter (active count unchanged)
    }else{
      this.webTestActive--;
    }
  }

  private static async webTestFetch(url: string, init?: RequestInit): Promise<Response> {
    await this.webTestAcquire();
    try{
      let lastErr: any;
      for(let attempt = 0; attempt < 4; attempt++){
        try{
          return await fetch(url, init);
        }catch(e){
          // Network-layer failure (ERR_INSUFFICIENT_RESOURCES, transient): back off and retry.
          lastErr = e;
          await spleep(50 * (attempt + 1));
        }
      }
      throw lastErr;
    }finally{
      this.webTestReleaseSlot();
    }
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  static async open(filepath: string, mode: 'r'|'w' = 'r'): Promise<any> {
    if(this.isWebTest()){
      // Synthetic handle: just the normalized path. read()/close() use it.
      return { __webTestPath: this.normalizePath(filepath) };
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<number>( (resolve, reject) => {
        fs.open(path.join(ApplicationProfile.directory, filepath), (err, fd) => {
          if(err){
            console.error(err);
            reject(err);
            return;
          }
          resolve(fd);
        });
      });
    }else{
      // console.log('open', filepath);
      filepath = this.normalizePath(filepath);
      const dirs = filepath.split('/');
      const filename = dirs.pop();
      const dirHandle = await this.resolveFilePathDirectoryHandle(filepath);
      if(dirHandle){
        const file = await dirHandle.getFileHandle(filename, {
          create: false
        });
        if(file){
          return file;
        }else{
          throw new Error('Failed to read file');
        }
      }else{
        throw new Error('Failed to locate file directory');
      }
    }
  }

  static async read(handle: FileSystemFileHandle|number, output: Uint8Array, offset: number, length: number, position: number){
    if(this.isWebTest()){
      const p = (handle as any) && (handle as any).__webTestPath;
      if(typeof p !== 'string') throw new Error('WEB_TEST read: expected a handle from GameFileSystem.open()');
      if(!(output instanceof Uint8Array)) throw new Error('No output buffer supplied!');
      const end = position + length - 1;
      const res = await this.webTestFetch(this.webTestFileUrl(p), { headers: { 'Range': `bytes=${position}-${end}` } });
      if(res.status === 416){ return output; } // requested past EOF — nothing to copy
      if(!res.ok && res.status !== 206 && res.status !== 200){
        throw new Error(`WEB_TEST read failed (${res.status}) for ${p}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      output.set(buf.length > length ? buf.subarray(0, length) : buf, offset);
      return output;
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<Uint8Array>( (resolve, reject) => {
        fs.read(handle as number, output, offset, length, position, (err, bytes, buffer) => {
          if(err) reject(err);
          output.set(new Uint8Array(buffer), offset);
          resolve(output);
        })
      });
    }else{
      if(!(handle)) throw new Error('No file handle supplied!');
      
      if(!(handle instanceof FileSystemFileHandle)) throw new Error('FileSystemFileHandle expected but one was not supplied!');
      
      if(!(output instanceof Uint8Array)) throw new Error('No output buffer supplied!');

      const file = await handle.getFile();
      if(!file) throw new Error('Failed to read file from handle!');

      let blob = await file.slice(position, position + length);
      let arrayBuffer = await blob.arrayBuffer();
      output.set(new Uint8Array(arrayBuffer), offset);
      // output.copy(new Uint8Array(arrayBuffer));
    }
  }

  static async close(handle: FileSystemFileHandle|number){
    if(this.isWebTest()){
      return; // HTTP reads are stateless — nothing to close
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<void>( (resolve, reject) => {
        fs.close(handle as number, () => {
          resolve();
        })
      });
    }else{
      //this api does not expose a close method for reads
      return;
    }
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  static async readFile(filepath: string, options: any = {}): Promise<Uint8Array> {
    // console.log('readFile', filepath);
    if(this.isWebTest()){
      const res = await this.webTestFetch(this.webTestFileUrl(filepath));
      if(!res.ok) throw new Error(`WEB_TEST readFile failed (${res.status}) for ${filepath}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<Uint8Array>( (resolve, reject) => {
        fs.readFile(path.join(ApplicationProfile.directory, filepath), options, (err, buffer) => {
          if(err) reject(undefined);
          resolve(new Uint8Array(buffer));
        })
      });
    }else{
      const file = await this.open(filepath);
      if(!file) throw new Error('Failed to read file');
      
      let handle = await file.getFile();
      return new Uint8Array( await handle.arrayBuffer() );
    }
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  static async writeFile(filepath: string, data: Uint8Array): Promise<boolean> {
    if(this.isWebTest()){
      // Writes go to the server-side scratch overlay — never the real install.
      const res = await this.webTestFetch(this.webTestMetaUrl('/gamedata-write', filepath), {
        method: 'POST',
        body: data as any,
      });
      return res.ok;
    }
    return new Promise<boolean>( async (resolve, reject) => {
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        fs.writeFile(path.join(ApplicationProfile.directory, filepath), data, (err) => {
          resolve(!err);
        })
      }else{
        filepath = this.normalizePath(filepath);
        const dirs = filepath.split('/');
        const filename = dirs.pop();
        const dirHandle = await this.resolveFilePathDirectoryHandle(filepath);
        
        if(!dirHandle) throw new Error('Failed to locate file directory');
        
        const newFile = await dirHandle.getFileHandle(filename, {
          create: true
        });

        if(!newFile) throw new Error('Failed to create file');

        try{
          let stream = await newFile.createWritable();
          await stream.write(data as any);
          await stream.close();
          resolve(true);
          return;
        }catch(e){
          console.error(e);
          resolve(false);
          return;
          // throw new Error('Failed to write file');
        }
      }
    });
  }

  static async readdir(
    dirpath: string, options: IGameFileSystemReadDirOptions = {}, files: any[] = []
  ): Promise<string[]> {
    if(this.isWebTest()){
      const extra: Record<string, string> = {};
      if(options.recursive) extra.recursive = '1';
      if(options.list_dirs) extra.list_dirs = '1';
      const res = await this.webTestFetch(this.webTestMetaUrl('/gamedata-meta/list', dirpath, extra));
      if(!res.ok) throw new Error(`WEB_TEST readdir failed (${res.status}) for ${dirpath}`);
      const list: string[] = await res.json();
      for(const f of list) files.push(f);
      return files;
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return await this.readdir_fs(dirpath, options, files);
    }else{
      return await this.readdir_web(dirpath, options, files);
    }
  }

  private static async readdir_web(pathOrHandle: string|FileSystemDirectoryHandle = '', opts: any = {},  files: any[] = [], dirbase: string = ''){
    try{
      if(typeof pathOrHandle === 'string'){
        const dirPath = pathOrHandle as string;
        pathOrHandle = await this.resolvePathDirectoryHandle(pathOrHandle);
        if(!pathOrHandle) throw new Error('Failed to locate directory inside game folder: '+dirPath);
        dirbase = pathOrHandle.name;
      }

      if(pathOrHandle instanceof FileSystemDirectoryHandle){
        // Convert async iterator to array for parallel processing
        const entries = [];
        for await (const entry of pathOrHandle.values()) {
          entries.push(entry);
        }

        // Separate files and directories for parallel processing
        const fileEntries = [];
        const directoryEntries = [];

        for (const entry of entries) {
          if (entry.kind === "file") {
            if (!opts.list_dirs) {
              fileEntries.push(entry.name);
            }
          } else if (entry.kind === "directory") {
            if (opts.recursive) {
              directoryEntries.push(entry);
            } else {
              files.push(path.join(dirbase, entry.name));
            }
          }
        }

        // Add files to results (no async needed)
        for (const fileName of fileEntries) {
          files.push(path.join(dirbase, fileName));
        }

        // Process subdirectories in parallel using Promise.all
        if (opts.recursive && directoryEntries.length > 0) {
          const subdirPromises = directoryEntries.map(async (entry) => {
            const newdirbase = path.join(dirbase, entry.name);
            const subdirFiles: string[] = [];
            await this.readdir_web(entry, opts, subdirFiles, newdirbase);
            return subdirFiles;
          });

          // Process all subdirectories in parallel
          const subdirResults = await Promise.all(subdirPromises);
          
          // Flatten results
          for (const subdirFiles of subdirResults) {
            files.push(...subdirFiles);
          }
        }
      }

      return files;

    }catch(e){
      console.error(e);
      if(typeof pathOrHandle === 'string'){
        throw new Error('Failed to resolve directory inside game folder: '+pathOrHandle);
      }else{
        throw new Error('Failed to resolve directory inside game folder: '+pathOrHandle.name);
      }
    }
  }

  private static async isFSDirectory(resource_path: string = ''): Promise<boolean> {
    return new Promise<boolean>( (resolve, reject) => {
      fs.stat(path.join(ApplicationProfile.directory, resource_path), (err, stats) => {
        if(err){
          console.error(err);
          reject();
          return;
        }
        resolve((stats.mode & fs.constants.S_IFDIR) == fs.constants.S_IFDIR)
      })
    });
  }

  private static async readdir_fs(resource_path: string = '', opts: IGameFileSystemReadDirOptions = {}, files: any[] = [], depthState?: any): Promise<string[]> {
    if(typeof depthState === 'undefined'){
      depthState = { folder: resource_path, depth: 0 };
    }
    const currentDepth: number = depthState.depth;
    const dir_path = path.join(ApplicationProfile.directory, resource_path);

    return new Promise<string[]>((resolve, reject) => {
      fs.readdir(dir_path, { withFileTypes: true }, async (err, dir_files: fs.Dirent[]) => {
        if(err){
          // resource_path is a file, not a directory
          if(!opts.list_dirs){
            files.push(resource_path);
          }
          resolve(files);
          return;
        }

        if(!!opts.list_dirs && currentDepth > 0){
          files.push(resource_path);
        }

        if(currentDepth < 1 || !!opts.recursive){
          const subdirPromises: Promise<string[]>[] = [];
          for(const file of dir_files){
            const file_path = path.join(resource_path, file.name);
            if(file.isDirectory()){
              if(!!opts.recursive){
                const subFiles: string[] = [];
                subdirPromises.push(
                  this.readdir_fs(file_path, opts, subFiles, { ...depthState, depth: currentDepth + 1 })
                );
              }else{
                files.push(file_path);
              }
            }else{
              if(!opts.list_dirs){
                files.push(file_path);
              }
            }
          }
          const subResults = await Promise.all(subdirPromises);
          for(const subFiles of subResults) files.push(...subFiles);
        }

        resolve(files);
      });
    });
  }

  static async mkdir(dirPath: string, opts: IGameFileSystemReadDirOptions = {}){
    if(this.isWebTest()){
      const extra: Record<string, string> = {};
      if(opts.recursive) extra.recursive = '1';
      const res = await this.webTestFetch(this.webTestMetaUrl('/gamedata-mkdir', dirPath, extra), { method: 'POST' });
      return res.ok;
    }
    return new Promise<boolean>( async (resolve, reject) => {
      dirPath = dirPath.trim();
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        fs.mkdir(path.join(ApplicationProfile.directory, dirPath), { recursive: !!opts.recursive }, (err) => {
          if(err){
            console.error(err);
            resolve(false);
            return;
          }
          resolve(true);
        });
      }else{
        if(dirPath.length){
          const dirs = dirPath.split(path.sep);
          const cacheKey = dirs.join('/');
          if(this.directoryCache.has(cacheKey)){
            resolve(true);
            return;
          }
          try{
            let currentDirHandle = ApplicationProfile.directoryHandle;
            for(let i = 0; i < dirs.length; i++){
              const canCreate = (i === dirs.length - 1) || !!opts.recursive;
              currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: canCreate });
              if(!currentDirHandle){
                resolve(false);
                return;
              }
              const partialKey = dirs.slice(0, i + 1).join('/');
              this.directoryCache.set(partialKey, currentDirHandle);
            }
            resolve(true);
          }catch(e){
            console.error(e);
            resolve(false);
            return;
          }
        }else{
          resolve(false);
          return;
        }
      }
    });
  }

  static async rmdir(dirPath: string, opts: IGameFileSystemReadDirOptions = {}){
    if(this.isWebTest()){
      const extra: Record<string, string> = {};
      if(opts.recursive) extra.recursive = '1';
      const res = await this.webTestFetch(this.webTestMetaUrl('/gamedata-unlink', dirPath, extra), { method: 'POST' });
      return res.ok;
    }
    return new Promise<boolean>( async (resolve, reject) => {
      dirPath = dirPath.trim();
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        console.log(`fs.rmdir`, path.join(ApplicationProfile.directory, dirPath));
        fs.rmdir(
          path.join(ApplicationProfile.directory, dirPath), 
          {
            recursive: opts.recursive
          } as fs.RmDirOptions, 
          //@ts-ignore
          async (err) => {
            if(err){
              console.error(err);
              resolve(false);
              return;
            }
            resolve(true);
          }
        );
      }else{
        try{
          const details = path.parse(dirPath);
          // let handle = await this.resolvePathDirectoryHandle(dirPath);
          let parentHandle = await this.resolvePathDirectoryHandle(details.dir);
          if(parentHandle == ApplicationProfile.directoryHandle) resolve(false);
          if(parentHandle){
            for await (const entry of parentHandle.values()) {
              if(entry.kind == 'file') continue;
              if(entry.name.toLowerCase() != details.name.toLowerCase()) continue;
              await parentHandle.removeEntry(entry.name, {
                recursive: opts.recursive
              });
              break;
            }
          }
          resolve(true);
          return;
        }catch(e){
          console.error(e);
          resolve(false);
          return;
        }
      }
    });
  }

  static async opendir_web(dirPath: string = ''): Promise<FileSystemDirectoryHandle|undefined> {
    const details = path.parse(dirPath);
    return await this.resolvePathDirectoryHandle(dirPath);
  }

  static exists(dirOrFilePath: string): Promise<boolean> {
    if(this.isWebTest()){
      return this.webTestFetch(this.webTestMetaUrl('/gamedata-meta/exists', dirOrFilePath))
        .then(r => r.ok ? r.json() : { exists: false })
        .then(j => !!j.exists)
        .catch(() => false);
    }
    return new Promise<boolean>( async (resolve, reject) => {
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        fs.stat(path.join(ApplicationProfile.directory, dirOrFilePath), (err, stats) => {
          if(err){
            console.log(dirOrFilePath);
            console.error(err);
            resolve(false);
            return
          }

          resolve(true);
        });
      }else{
        const details = path.parse(dirOrFilePath);
        try{
          if(details.ext){
            let handle = await this.resolveFilePathDirectoryHandle(dirOrFilePath);
            if(handle){
              let fileHandle = await handle.getFileHandle(details.base);
              if(fileHandle){
                resolve(true);
                return;
              }else{
                resolve(false);
                return;
              }
            }else{
              resolve(false);
              return;
            }
          }else{
            let handle = await this.resolvePathDirectoryHandle(dirOrFilePath);
            if(handle){
              resolve(true);
              return;
            }else{
              resolve(false);
              return;
            }
          }
        }catch(e){
          console.log(dirOrFilePath);
          console.error(e);
          resolve(false);
          return;
        }
      }
    });
  }

  static async unlink(handleOrPath: string|FileSystemFileHandle){
    if(this.isWebTest()){
      let p: string;
      if(typeof handleOrPath === 'string') p = this.normalizePath(handleOrPath);
      else if((handleOrPath as any) && (handleOrPath as any).__webTestPath) p = (handleOrPath as any).__webTestPath;
      else throw new Error('WEB_TEST unlink: supply a path string');
      const res = await this.webTestFetch(this.webTestMetaUrl('/gamedata-unlink', p), { method: 'POST' });
      if(!res.ok) throw new Error('WEB_TEST unlink failed for ' + p);
      return;
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<void>( (resolve, reject) => {
        try{
          fs.unlink(handleOrPath as string, () => {
            resolve();
            return;
          })
        }catch(e){
          console.error(e);
          reject(e);
          return;
        }
      })
    }else{
      if(handleOrPath instanceof FileSystemFileHandle && webHandleHasRemove){
        //@ts-ignore
        await handleOrPath.remove();
        return;
      }
      if(typeof handleOrPath === 'string'){
        const normalized = this.normalizePath(handleOrPath);
        const details = path.parse(normalized);
        const parentHandle = await this.resolveFilePathDirectoryHandle(normalized);
        if(parentHandle) await parentHandle.removeEntry(details.base);
      }else{
        throw new Error('unlink: supply a path string in web mode, not a FileSystemFileHandle');
      }
    }
  }

  static async showOpenFileDialog(){
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){

    }else{
      // const pickerOpts = {
      //   types: [
      //     {
      //       description: 'Images',
      //       accept: {
      //         'image/*': ['.png', '.gif', '.jpeg', '.jpg']
      //       }
      //     },
      //   ],
      //   excludeAcceptAllOption: true,
      //   multiple: false
      // };
      let [fileHandle] = await window.showOpenFilePicker({multiple: false});
      return fileHandle;
    }
  }

  static async showSaveFileDialog(): Promise<FileSystemFileHandle | undefined> {
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return undefined;
    }else{
      return await window.showSaveFilePicker({});
    }
  }

  private static async resolvePathDirectoryHandle(filepath: string, parent = false): Promise<FileSystemDirectoryHandle> {
    if(ApplicationProfile.directoryHandle){
      const dirs = filepath.length ? filepath.split('/') : [];
      const cacheKey = dirs.join('/');
      if(this.directoryCache.has(cacheKey)){
        const cached = this.directoryCache.get(cacheKey)!;
        if(!parent) return cached;
        // for parent=true we need the second-to-last handle; fall through to traverse
      }
      if(!parent && this.directoryInflight.has(cacheKey)){
        return this.directoryInflight.get(cacheKey)!;
      }
      const promise = (async () => {
        let lastDirectoryHandle = ApplicationProfile.directoryHandle;
        let currentDirHandle = ApplicationProfile.directoryHandle;
        for(let i = 0, len = dirs.length; i < len; i++){
          lastDirectoryHandle = currentDirHandle;
          const partialKey = dirs.slice(0, i + 1).join('/');
          if(this.directoryCache.has(partialKey)){
            currentDirHandle = this.directoryCache.get(partialKey)!;
            continue;
          }
          try{
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: false });
          }catch{
            // Fallback: case-insensitive scan for case-sensitive FSAPI
            let found = false;
            for await (const entry of currentDirHandle.values()){
              if(entry.kind === 'directory' && entry.name.toLowerCase() === dirs[i].toLowerCase()){
                currentDirHandle = entry as FileSystemDirectoryHandle;
                found = true;
                break;
              }
            }
            if(!found){
              this.directoryInflight.delete(cacheKey);
              throw new Error(`Failed to resolve file path directory handle: Filepath: ${filepath} | Current Directory: ${dirs[i]} | Index: ${i}`);
            }
          }
          this.directoryCache.set(partialKey, currentDirHandle);
        }
        this.directoryCache.set(cacheKey, currentDirHandle);
        this.directoryInflight.delete(cacheKey);
        return !parent ? currentDirHandle : lastDirectoryHandle;
      })();
      if(!parent){
        this.directoryInflight.set(cacheKey, promise);
      }
      return promise;
    }
    return;
  }

  static directoryCache: Map<string, FileSystemDirectoryHandle> = new Map();
  static directoryInflight: Map<string, Promise<FileSystemDirectoryHandle>> = new Map();

  private static async resolveFilePathDirectoryHandle(filepath: string): Promise<FileSystemDirectoryHandle> {
    if(ApplicationProfile.directoryHandle){
      const dirs = filepath.split('/');
      dirs.pop(); // remove filename
      const cacheKey = dirs.join('/');
      if(this.directoryCache.has(cacheKey)){
        return this.directoryCache.get(cacheKey)!;
      }
      if(this.directoryInflight.has(cacheKey)){
        return this.directoryInflight.get(cacheKey)!;
      }
      const promise = (async () => {
        let currentDirHandle = ApplicationProfile.directoryHandle;
        for(let i = 0, len = dirs.length; i < len; i++){
          const partialKey = dirs.slice(0, i + 1).join('/');
          if(this.directoryCache.has(partialKey)){
            currentDirHandle = this.directoryCache.get(partialKey)!;
            continue;
          }
          try{
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: false });
          }catch{
            // Fallback: case-insensitive scan for case-sensitive FSAPI
            let found = false;
            for await (const entry of currentDirHandle.values()){
              if(entry.kind === 'directory' && entry.name.toLowerCase() === dirs[i].toLowerCase()){
                currentDirHandle = entry as FileSystemDirectoryHandle;
                found = true;
                break;
              }
            }
            if(!found){
              this.directoryInflight.delete(cacheKey);
              throw new Error(`Failed to resolve file path directory handle: Filepath: ${filepath} | Current Directory: ${dirs[i]} | Index: ${i}`);
            }
          }
          this.directoryCache.set(partialKey, currentDirHandle);
        }
        this.directoryCache.set(cacheKey, currentDirHandle);
        this.directoryInflight.delete(cacheKey);
        return currentDirHandle;
      })();
      this.directoryInflight.set(cacheKey, promise);
      return promise;
    }
    return;
  }

  static async initializeGameDirectory(){
    if(this.isWebTest()){
      // No directory picker in headless test mode — data is served over HTTP.
      return;
    }
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      ApplicationProfile.directory = ApplicationProfile.directory;
    }else{
      ApplicationProfile.directoryHandle = await window.showDirectoryPicker({
        mode: "readwrite"
      });
    }
  }

  static async validateDirectoryHandle(handle: FileSystemDirectoryHandle){
    try{
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        return true;
      }
      return false;
    }catch(e){
      console.error(e);
      return false;
    }
  }

  static async showRequestDirectoryDialog(){
    let handle = await window.showDirectoryPicker({
      id: ApplicationProfile.profile?.key,
      mode: "readwrite"
    });
    if(handle){
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        return handle;
      }
    }
    return;
  }


}
