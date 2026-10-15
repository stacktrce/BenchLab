import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideRouter, withComponentInputBinding } from "@angular/router";

import { routes } from "./app.routes";
import { LogErrorHandler } from "./core/log-error-handler";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: ErrorHandler, useClass: LogErrorHandler },
  ],
};
