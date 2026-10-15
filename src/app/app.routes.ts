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
    path: "suites/:id/trends",
    loadComponent: () =>
      import("./features/suite-trends/suite-trends.component").then((m) => m.SuiteTrendsComponent),
  },
  {
    path: "runs/:id/charts",
    loadComponent: () =>
      import("./features/run-charts/run-charts.component").then((m) => m.RunChartsComponent),
  },
  {
    path: "runs/:id",
    loadComponent: () =>
      import("./features/run-detail/run-detail.component").then((m) => m.RunDetailComponent),
  },
  {
    path: "settings",
    loadComponent: () => import("./features/settings/settings.component").then((m) => m.SettingsComponent),
  },
  {
    path: "history",
    loadComponent: () => import("./features/history/history.component").then((m) => m.HistoryComponent),
  },
  {
    path: "compare/charts",
    loadComponent: () =>
      import("./features/compare-charts/compare-charts.component").then((m) => m.CompareChartsComponent),
  },
  {
    path: "compare",
    loadComponent: () =>
      import("./features/compare/compare.component").then((m) => m.CompareComponent),
  },
  { path: "**", redirectTo: "quick" },
];
