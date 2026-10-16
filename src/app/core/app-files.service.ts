import { Service } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Mirrors the Rust `paths::commands::AppPaths`. */
export interface AppPaths {
  database: string;
  log: string;
}

/** Where BenchLab keeps its own files, and showing them in the system's file manager. */
@Service()
export class AppFilesService {
  paths(): Promise<AppPaths> {
    return invoke<AppPaths>("app_paths");
  }

  revealInFolder(path: string): Promise<void> {
    return revealItemInDir(path);
  }
}
