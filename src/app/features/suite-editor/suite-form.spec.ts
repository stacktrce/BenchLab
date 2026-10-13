import { describe, expect, it } from "vitest";
import { Suite } from "../../core/models";
import { validateSuite } from "../../core/suite-validation";
import { CaseFormValue, caseToFormValue, formToDraft, SuiteFormValue } from "./suite-form";

const formCase = (over: Partial<CaseFormValue> = {}): CaseFormValue => ({ ...caseToFormValue(), name: "a", command: "echo", ...over });

const raw = (over: Partial<SuiteFormValue> = {}): SuiteFormValue => ({
  name: "S",
  description: "",
  runs: 10,
  warmup: 1,
  cases: [formCase()],
  ...over,
});

const saved: Suite = {
  id: "s1", name: "Old", description: "", runs: 5, warmup: 0, baselineRunId: "r1", schemaVersion: 1,
  createdAt: "2026-01-01", updatedAt: "2026-01-02", cases: [],
};

describe("caseToFormValue", () => {
  it("gives a blank, enabled row with no budget when there is no case", () => {
    expect(caseToFormValue()).toEqual({
      id: "", name: "", command: "", setupCommand: "", cleanupCommand: "", workingDirectory: "", enabled: true, budgetPercent: null,
    });
  });

  it("turns missing hooks into empty strings for the text inputs and keeps a budget", () => {
    const v = caseToFormValue({
      id: "c1", name: "n", command: "x", setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: false, budgetPercent: 5,
    });
    expect(v).toMatchObject({ id: "c1", setupCommand: "", cleanupCommand: "", workingDirectory: "", enabled: false, budgetPercent: 5 });
  });

  it("treats a budget missing from an old snapshot as none", () => {
    expect(caseToFormValue({ name: "n" }).budgetPercent).toBeNull();
  });
});

describe("formToDraft", () => {
  it("turns empty hook and directory strings into null and keeps real ones", () => {
    const [empty, filled] = formToDraft(
      raw({
        cases: [
          formCase(),
          formCase({ name: "b", setupCommand: "make", cleanupCommand: "clean", workingDirectory: "/work" }),
        ],
      }),
      null,
    ).cases;
    expect([empty.setupCommand, empty.cleanupCommand, empty.workingDirectory]).toEqual([null, null, null]);
    expect([filled.setupCommand, filled.cleanupCommand, filled.workingDirectory]).toEqual(["make", "clean", "/work"]);
  });

  it("coerces runs and warm-up to numbers", () => {
    const draft = formToDraft(raw({ runs: "7" as unknown as number, warmup: "2" as unknown as number }), null);
    expect([draft.runs, draft.warmup]).toEqual([7, 2]);
  });

  it("turns an emptied number field into 0, which validation then rejects", () => {
    const draft = formToDraft(raw({ runs: null as unknown as number }), null);
    expect(draft.runs).toBe(0);
    expect(validateSuite(draft)).toContain("Runs must be at least 1.");
  });

  it("takes the pinned baseline and the metadata from the saved suite, never from the form", () => {
    const draft = formToDraft(raw(), saved);
    expect(draft).toMatchObject({ id: "s1", baselineRunId: "r1", schemaVersion: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02" });
  });

  it("describes an unsaved suite with empty ids and no baseline", () => {
    expect(formToDraft(raw(), null)).toMatchObject({ id: "", baselineRunId: null, schemaVersion: 0, createdAt: "", updatedAt: "" });
  });

  it("keeps case ids so editing does not recreate unchanged cases", () => {
    expect(formToDraft(raw({ cases: [formCase({ id: "c9" })] }), saved).cases[0].id).toBe("c9");
  });

  it("sends a cleared budget as null and keeps a set one", () => {
    const [none, set] = formToDraft(raw({ cases: [formCase({ budgetPercent: null }), formCase({ name: "b", budgetPercent: 7.5 })] }), null).cases;
    expect([none.budgetPercent, set.budgetPercent]).toEqual([null, 7.5]);
  });

  it("does not mutate the form value", () => {
    const input = raw({ cases: [formCase({ setupCommand: "" })] });
    formToDraft(input, null);
    expect(input.cases[0].setupCommand).toBe("");
  });
});
