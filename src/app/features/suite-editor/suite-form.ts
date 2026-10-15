import { NonNullableFormBuilder } from "@angular/forms";
import { Suite, SuiteCase } from "../../core/models";

export interface CaseFormValue {
  id: string;
  name: string;
  command: string;
  setupCommand: string;
  cleanupCommand: string;
  workingDirectory: string;
  enabled: boolean;
  budgetPercent: number | null;
}

export interface SuiteFormValue {
  name: string;
  description: string;
  runs: number;
  warmup: number;
  cases: CaseFormValue[];
}

/** Text inputs hold empty strings, never null, so a missing hook becomes "". */
export function caseToFormValue(c?: Partial<SuiteCase>): CaseFormValue {
  return {
    id: c?.id ?? "",
    name: c?.name ?? "",
    command: c?.command ?? "",
    setupCommand: c?.setupCommand ?? "",
    cleanupCommand: c?.cleanupCommand ?? "",
    workingDirectory: c?.workingDirectory ?? "",
    enabled: c?.enabled ?? true,
    budgetPercent: c?.budgetPercent ?? null,
  };
}

export function createCaseGroup(fb: NonNullableFormBuilder, c?: Partial<SuiteCase>) {
  const v = caseToFormValue(c);
  return fb.group({
    id: fb.control(v.id),
    name: fb.control(v.name),
    command: fb.control(v.command),
    setupCommand: fb.control(v.setupCommand),
    cleanupCommand: fb.control(v.cleanupCommand),
    workingDirectory: fb.control(v.workingDirectory),
    enabled: fb.control(v.enabled),
    budgetPercent: fb.control<number | null>(v.budgetPercent),
  });
}

export function createSuiteForm(fb: NonNullableFormBuilder) {
  return fb.group({
    name: fb.control(""),
    description: fb.control(""),
    runs: fb.control(10),
    warmup: fb.control(1),
    cases: fb.array([createCaseGroup(fb)]),
  });
}

export type SuiteForm = ReturnType<typeof createSuiteForm>;

/** Replaces the form's contents with `suite`. A case given as `{}` becomes a blank row. */
export function fillSuiteForm(
  form: SuiteForm,
  fb: NonNullableFormBuilder,
  suite: Pick<Suite, "name" | "description" | "runs" | "warmup"> & { cases: Partial<SuiteCase>[] },
): void {
  form.patchValue({ name: suite.name, description: suite.description, runs: suite.runs, warmup: suite.warmup });
  form.controls.cases.clear();
  suite.cases.forEach((c) => form.controls.cases.push(createCaseGroup(fb, c)));
}

/**
 * The suite to send to the backend. Everything the form does not edit (ids, timestamps, the pinned
 * baseline) comes from `saved`, so editing can never change it.
 */
export function formToDraft(raw: SuiteFormValue, saved: Suite | null): Suite {
  return {
    id: saved?.id ?? "",
    name: raw.name,
    description: raw.description,
    runs: Number(raw.runs),
    warmup: Number(raw.warmup),
    baselineRunId: saved?.baselineRunId ?? null,
    schemaVersion: saved?.schemaVersion ?? 0,
    createdAt: saved?.createdAt ?? "",
    updatedAt: saved?.updatedAt ?? "",
    cases: raw.cases.map((c) => ({
      ...c,
      setupCommand: c.setupCommand || null,
      cleanupCommand: c.cleanupCommand || null,
      workingDirectory: c.workingDirectory || null,
      budgetPercent: c.budgetPercent ?? null,
    })),
  };
}

export type CaseFormArray = ReturnType<typeof createSuiteForm>["controls"]["cases"];
