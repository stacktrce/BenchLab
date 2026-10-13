import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "quick" },
  {
    path: "quick",
    loadComponent: () =>
      import("./features/quick-run/quick-run.component").then((m) => m.QuickRunComponent),
  },
  {
    path: "suites/new",
    loadComponent: () =>
      import("./features/suite-editor/suite-editor.component").then((m) => m.SuiteEditorComponent),
  },
  {
    path: "suites/:id",
    loadComponent: () =>
      import("./features/suite-editor/suite-editor.component").then((m) => m.SuiteEditorComponent),
  },
  {
    path: "runs/:id",
    loadComponent: () =>
      import("./features/run-detail/run-detail.component").then((m) => m.RunDetailComponent),
  },
  {
    path: "compare",
    loadComponent: () =>
      import("./features/compare/compare.component").then((m) => m.CompareComponent),
  },
  { path: "**", redirectTo: "quick" },
];
