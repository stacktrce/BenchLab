import { describe, expect, it } from "vitest";
import { compareRuns, gitNotes } from "./compare";
import { comparisonToMarkdown, runToMarkdown } from "./export";
import { describeGit } from "./format";
import { GitInfo, RunRecord } from "./models";
import { BenchmarkResult } from "./parser/hyperfine.types";

const git = (over: Partial<GitInfo> = {}): GitInfo => ({
  dir: "/code/app",
  root: "/code/app",
  commit: "9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c",
  shortCommit: "9f2c1d4",
  branch: "main",
  dirty: false,
  changedFiles: 0,
  ...over,
});

const other = git({ commit: "c71ab3e90d24f5a6b7c8d9e0f1a2b3c4d5e6f7a8", shortCommit: "c71ab3e", branch: "perf/join" });

const record: RunRecord = {
  id: "r", suiteId: "s", suiteName: "S", startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:23.000Z", status: "completed", toolVersion: "hyperfine 1.20.0", caseCount: 0, error: null, note: null, tags: [],
};

describe("describeGit", () => {
  it("shows branch and short commit", () => {
    expect(describeGit(git())).toBe("main @ 9f2c1d4");
  });

  it("says detached for a detached HEAD and counts uncommitted files", () => {
    expect(describeGit(git({ branch: null, dirty: true, changedFiles: 1 }))).toBe("detached @ 9f2c1d4, 1 uncommitted file");
    expect(describeGit(git({ dirty: true, changedFiles: 3 }))).toBe("main @ 9f2c1d4, 3 uncommitted files");
  });
});

describe("gitNotes", () => {
  it("is silent when neither run has git state", () => {
    expect(gitNotes([], [])).toEqual([]);
  });

  it("says when only one run has it", () => {
    expect(gitNotes([git()], [])).toEqual([{ kind: "info", text: "Git state was recorded for only one of the runs." }]);
  });

  it("calls out the same commit on both sides as noise or environment", () => {
    const [note, ...rest] = gitNotes([git()], [git()]);
    expect(rest).toEqual([]);
    expect(note.kind).toBe("info");
    expect(note.text).toContain("Same commit in both runs (9f2c1d4)");
    expect(note.text).toContain("not from a code change");
  });

  it("describes a code change between two commits", () => {
    const [note] = gitNotes([git()], [other]);
    expect(note.text).toBe("Code changed: main @ 9f2c1d4 to perf/join @ c71ab3e.");
  });

  it("warns for each side that ran with uncommitted changes", () => {
    const dirtyBaseline = git({ dirty: true, changedFiles: 1 });
    const dirtyCandidate = { ...other, dirty: true, changedFiles: 2 };
    const notes = gitNotes([dirtyBaseline], [dirtyCandidate]);
    const warnings = notes.filter((n) => n.kind === "warn");
    expect(warnings.map((w) => w.text.split(" ")[0])).toEqual(["Baseline", "Candidate"]);
    expect(warnings[1].text).toContain("2 uncommitted files");
    expect(warnings[1].text).toContain("c71ab3e does not fully describe");
  });

  it("does not claim 'same commit' is clean when the tree was dirty", () => {
    const notes = gitNotes([git()], [git({ dirty: true, changedFiles: 1 })]);
    expect(notes.some((n) => n.kind === "warn" && n.text.startsWith("Candidate ran with 1 uncommitted file"))).toBe(true);
  });

  it("handles several repositories and ones present on one side only", () => {
    const lib = git({ root: "/code/lib", dir: "/code/lib" });
    const notes = gitNotes([git(), lib], [other]);
    expect(notes.some((n) => n.text.startsWith("/code/app: Code changed"))).toBe(true);
    expect(notes.some((n) => n.text === "/code/lib was recorded only for the baseline run.")).toBe(true);
  });
});

describe("git state in exports", () => {
  const empty: BenchmarkResult = { cases: [] };

  it("adds a Code line to a run", () => {
    const md = runToMarkdown(record, empty, null, [git({ dirty: true, changedFiles: 2 })]);
    expect(md).toContain("Code: `main @ 9f2c1d4, 2 uncommitted files` in `/code/app`");
  });

  it("omits it when there is none", () => {
    expect(runToMarkdown(record, empty, null)).not.toContain("Code:");
  });

  it("adds a Code state section with warnings to a comparison", () => {
    const notes = gitNotes([git()], [{ ...other, dirty: true, changedFiles: 1 }]);
    const md = comparisonToMarkdown(compareRuns(empty, empty), record, record, [], notes);
    expect(md).toContain("## Code state");
    expect(md).toContain("- Code changed: main @ 9f2c1d4 to perf/join @ c71ab3e");
    expect(md).toContain("- **Warning:** Candidate ran with 1 uncommitted file");
  });
});
