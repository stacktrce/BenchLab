import { ErrorHandler } from "@angular/core";
import { error as logError } from "@tauri-apps/plugin-log";
import { errorMessage } from "./errors";

/** Uncaught errors also go to the app's log file, which outlives the window. */
export class LogErrorHandler extends ErrorHandler {
  override handleError(e: unknown): void {
    super.handleError(e);
    const stack = e instanceof Error && e.stack ? `\n${e.stack}` : "";
    // Logging must never cause a second error, for example outside the desktop app.
    logError(`Uncaught: ${errorMessage(e)}${stack}`).catch(() => undefined);
  }
}
