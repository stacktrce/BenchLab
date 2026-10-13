// A stand-in for the Tauri bridge so the Angular app can run in a plain browser with realistic
// data. `tauriMock` is serialised into the page by Puppeteer (evaluateOnNewDocument), so it must
// not reference anything outside its own body.
//
// Commands the app calls that are not listed here reject with "mock: <name>". The audit relies on
// that to prove, for example, that Ctrl+S reaches the save handler.

/** @param {{ empty: boolean }} options */
export function tauriMock({ empty }) {
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const result = (name, mean, spread, runs, coldFirst = 1) => {
    const times = Array.from({ length: runs }, () => Math.max(1e-5, mean * (1 + spread * noise() * 1.7)));
    times[0] *= coldFirst;
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    const sd = Math.sqrt(times.reduce((a, t) => a + (t - avg) ** 2, 0) / (runs - 1));
    const sorted = [...times].sort((a, b) => a - b);
    return {
      command: name, mean: avg, stddev: sd, median: sorted[Math.floor(runs / 2)], user: avg * 0.8,
      system: avg * 0.1, min: sorted[0], max: sorted[runs - 1], times, exit_codes: Array(runs).fill(0),
    };
  };

  const baseline = [
    result("concat with +=", 0.042, 0.03, 10), result("array join", 0.031, 0.04, 10),
    result("template literal", 0.028, 0.03, 10), result("regex split", 0.055, 0.05, 10, 3.2),
  ];
  const candidate = [
    result("concat with +=", 0.0415, 0.06, 10), result("array join", 0.024, 0.03, 10),
    result("template literal", 0.036, 0.04, 10), result("regex split", 0.054, 0.12, 3),
  ];

  const suite = {
    id: "s1", name: "Demo: string building (sample data)",
    description: "Sample data. The commands are placeholders; edit them before running.",
    runs: 10, warmup: 1, baselineRunId: "r1", schemaVersion: 1, createdAt: "", updatedAt: "",
    cases: baseline.map((b, i) => ({
      id: `c${i}`, name: b.command, command: `node bench/${["concat", "join", "template", "split"][i]}.js`,
      setupCommand: i === 3 ? "node bench/prepare.js" : null, cleanupCommand: null, workingDirectory: null, enabled: true,
      budgetPercent: [5, null, 10, 20][i],
    })),
  };

  const gitState = (commit, branch, changedFiles) => ({
    dir: "~/code/strings", root: "~/code/strings", commit, shortCommit: commit.slice(0, 7), branch,
    dirty: changedFiles > 0, changedFiles,
  });

  const run = (id, startedAt, results, git) => ({
    record: {
      id, suiteId: suite.id, suiteName: suite.name, startedAt, finishedAt: startedAt.replace(":00.000", ":23.000"),
      status: "completed", toolVersion: "hyperfine 1.20.0 (sample)", caseCount: results.length, error: null,
    },
    config: suite,
    git: [git],
    rawOutput: JSON.stringify({ results }),
  });
  const runs = {
    r1: run("r1", "2026-10-12T09:00:00.000Z", baseline, gitState("9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c", "main", 0)),
    r2: run("r2", "2026-10-13T11:30:00.000Z", candidate, gitState("c71ab3e90d24f5a6b7c8d9e0f1a2b3c4d5e6f7a8", "perf/join", 2)),
  };

  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    invoke: async (command, args) => {
      switch (command) {
        case "find_hyperfine":
          return { path: "C:\\Program Files\\BenchLab\\hyperfine.exe", source: "bundled", version: "hyperfine 1.20.0" };
        case "list_suites_cmd":
          return empty ? [] : [{ id: suite.id, name: suite.name, description: suite.description, caseCount: 4, updatedAt: "" }];
        case "list_runs_cmd":
          return empty ? [] : [runs.r2.record, runs.r1.record];
        case "get_suite":
          return suite;
        case "get_run_cmd":
          return runs[args.id];
        default:
          throw `mock: ${command}`;
      }
    },
  };
}
