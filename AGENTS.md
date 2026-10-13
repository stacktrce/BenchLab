# AGENTS.md

Rules for any AI agent (or human) changing BenchLab. Read this before editing code. The maintainer keeps the product plan and status in a personal, untracked `.agents/` folder (ignored by `.gitignore` on purpose). If it exists on your machine, read `.agents/benchlab-plan.md` too; if not, everything you need to change code safely is in this file and the README.

The standard to hold yourself to: **a change should leave the codebase healthier than you found it.** Not perfect, better. Do not land a change that makes the code harder to understand, test or change, even under time pressure.

## 1. Work like this

1. **Read first.** Read the files you will touch and their neighbours, and match what is there. Look for an existing helper before writing one.
2. **Understand the request.** If a choice is the user's to make and you cannot settle it from the code, the plan or this file, ask. Otherwise pick the conventional option, say what you picked, and continue.
3. **Do the smallest thing that fully solves the problem.** No speculative generality, no features nobody asked for, no configuration for a future that may not come. Solve today's problem.
4. **Prove it.** Run the checks in section 6. Report what actually happened: if a test fails or you skipped something, say so with the output. Never claim "done" or "works" without evidence.
5. **Say what you did not verify.** Windows is the only tested platform. UI changes are only really verified by looking at a rendered screen.

## 2. Git: branches and commits

Never commit directly to `main`. Every change, however small, goes on a topic branch and is committed in small steps. Do not merge, rebase onto, push, force-push, amend published commits or delete branches unless the user asks.

**Branches**

- Create from an up-to-date `main`: `git switch main && git switch -c <type>/<short-topic>`.
- Types: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/`, `perf/`. Topic is lowercase kebab-case: `feat/pin-baseline`, `fix/cancel-orphan-process`.
- One topic per branch. If you notice an unrelated problem, note it or open a separate branch; do not fold it in.

**Commits**

- **Small and self-contained.** One logical change per commit, with its tests. After every commit the project builds and all tests pass, so any commit can be reverted or bisected on its own. Roughly 100 changed lines is a comfortable size; around 1,000 is too big. When unsure, go smaller.
- **Refactors are separate commits** from behaviour changes. A refactor commit changes no behaviour and no tests (that is how you show it). Adding missing tests for existing code goes first, in its own commit, so the refactor is protected.
- **New behaviour comes with its tests in the same commit.** A new function or API is introduced together with a real use of it.
- **Do not mix** formatting-only changes, dependency bumps or file moves with logic changes.
- **Message format: [Conventional Commits](https://www.conventionalcommits.org/).** `type(scope): subject`
  - Types as for branches, plus `build`, `ci`. Scope is optional: `core`, `compare`, `export`, `runner`, `db`, `ui`, `bundle`.
  - Subject: imperative mood, lowercase, no trailing period, 72 characters or fewer. "add", not "added".
  - Body (when the why is not obvious): wrap at 72, explain *why* and any trade-off, not a restatement of the diff. Mention a migration, a changed contract, or a verification you could not do.
  - Breaking change: `!` after the type and a `BREAKING CHANGE:` footer.
  - Keep the attribution trailer the environment requires, as the last line.
- **Before every commit:** `git status` and `git diff --staged`. Stage by path (`git add <files>`), not `git add -A`, so you only commit what you meant to. Never commit secrets, `node_modules`, `target/`, `dist/`, the downloaded `src-tauri/binaries/hyperfine-*` files, or database files.
- **Migrations are append-only.** Never edit an applied migration; add the next one and test the upgrade from the previous schema.

**Hand-off.** When a branch is ready, summarise it for the user: what changed and why, how it was verified, what was not verified, and the commit list. The user decides on merging.

## 3. Code quality

These come from Google's engineering practices for code review (see Sources), adapted to this repository. Review your own diff against every item before you call it finished.

1. **Design.** The pieces interact sensibly. The code belongs where you put it. Pure logic lives in `src/app/core` (no Angular imports, unit-tested); Tauri calls are wrapped in services; components stay thin. Rust functions take `&Connection` or plain values so they are testable without Tauri.
2. **Functionality.** It does what the user needs, and what the next developer needs. Think through edge cases (empty input, one sample, zero baseline, missing optional fields, a failing case in the middle of a suite, a path with spaces), concurrency (the single run slot, cancellation racing completion) and failure paths, not just the happy path.
3. **Complexity.** Could a reader understand each function quickly? Could a later change easily introduce a bug here? If not, simplify. Prefer a flat, obvious solution to a clever one. Remove dead code; do not comment it out.
4. **Tests.** Section 5.
5. **Naming.** Names say what a thing is or does, without abbreviations that need decoding. A boolean reads as a question (`hasFailedRuns`, `canRun`). Units go in the name or the type when they are not obvious (`deltaSeconds`, `timeout_secs`).
6. **Comments explain why, not what.** If a comment has to say what the code does, rewrite the code.
   - **Delete** a comment that restates the name, the type or the next line; narrates steps ("loop over the cases"); labels a section; is commented-out code; or is a TODO with no owner.
   - **Keep** a comment that records a reason, a constraint, a trap, a unit, an ordering requirement or a safety rationale ("GNU tar misreads C:\ as a remote host"; why a child is killed as a tree; why `fsmonitor` is disabled).
   - **Doc comments** on public functions and types stay when they say something the signature does not: units, what absence or failure means, an invariant. They go when they only repeat the name.
   - Delete comments your change made stale. Never delete or shorten a comment you were not asked to touch, except on a branch whose stated purpose is a comment cleanup.
7. **Consistency.** Follow the existing style and patterns. Where there is no rule, match the surrounding code. Do not restyle code you are not otherwise changing.
8. **Documentation.** If you change how the app is built, run, configured, installed or what it guarantees, update the README and the plan in the same branch.
9. **Every line.** Read every line of your diff before committing. If you do not understand something you wrote or copied, fix that first. Generated or lockfile changes can be skimmed, but know why they changed.
10. **Context.** Look at the whole file and the system, not only the hunk. A small change can show that a function should be restructured. Small complexities add up; do not add them.

Do not hold the codebase to a stricter bar than you meet: minor polish that does not change correctness or clarity is optional. Mark such items "nit" in review notes.

## 4. Language rules

### TypeScript and Angular

From the official Angular guidance (see Sources), plus what this repo already does:

- `strict` typing. Rely on inference when the type is obvious. No `any`; use `unknown` and narrow it.
- Standalone components only (no NgModules, no `standalone: true` in the decorator, it is the default). Do not set `ChangeDetectionStrategy.OnPush` explicitly (default in v22).
- Signals for state; `computed()` for derived state; `linkedSignal()` when state derives from several sources and must stay in sync. Never `mutate`; use `set` or `update`. Keep transformations pure.
- `input()`, `output()`, `model()` instead of decorators. Host bindings and listeners go in the decorator's `host` object, not `@HostBinding`/`@HostListener`.
- Native control flow (`@if`, `@for`, `@switch`); always give `@for` a meaningful `track`. `class` and `style` bindings instead of `ngClass`/`ngStyle`. Do not import `CommonModule`.
- Templates stay simple. Logic belongs in the class or in a pure function in `core/`.
- Inject with `inject()`. One responsibility per service. New singleton services use the `@Service` decorator (Angular 22+; available in the installed 22.2.2). Existing `@Injectable({ providedIn: "root" })` services stay as they are until you touch them for another reason.
- Lazy-load feature routes. Components stay small and single-purpose. Prefer inline templates only for very small components.
- Forms: prefer Signal Forms for new forms; otherwise Reactive forms. (The suite editor uses Reactive forms; migrate it deliberately, not as a drive-by.)
- Accessibility is a requirement: pass AXE, meet WCAG AA (contrast, focus, ARIA). Every control has an accessible name; icon-only buttons need `aria-label`; dialogs trap and restore focus.
- Never put a string from user data into HTML unsafely. No `innerHTML` with user or command text.
- Formatting follows the existing files: 2 spaces, double quotes, semicolons, trailing commas in multi-line literals.

### Where code runs: TypeScript or Rust

Rust owns what needs the operating system or durable state: processes, the database, files, git. Parsing hyperfine output, comparison statistics and export stay in TypeScript (`src/app/core`). This was measured, not assumed (Node/V8 against `serde_json` in a release build, same files, median of 7):

| Input | TS: parse and validate | Rust: typed parse | TS: compare | TS: CSV export |
|---|---|---|---|---|
| 5,000 cases x 10 timings (1.8 MB) | 5.9 ms | 6.8 ms | 1.6 ms | 2.9 ms |
| 50,000 cases x 10 timings (18 MB) | 78 ms | 73 ms | 38 ms | 35 ms |
| 5,000 cases x 1,000 timings (82 MB) | 307 ms | 202 ms | 3 ms | 4 ms |

Rust is not meaningfully faster at the sizes that occur (a suite has tens of cases, not thousands), and it would not help even at 82 MB, because the parsed data would have to cross the IPC bridge as JSON and be parsed again in the webview. It would also duplicate the validation and the tests, and split the logic the exports and comparison share. In practice the cost of a big result set is rendering rows, which is why tables are paged.

Revisit only if a feature adds real CPU work on the timing arrays (for example bootstrap confidence intervals or outlier detection over thousands of cases). Try a Web Worker first; move to Rust only if measurement shows the worker is not enough.

### Rust

- `cargo fmt` and `cargo clippy --all-targets -- -D warnings` must be clean.
- No `unwrap()`/`expect()` outside tests and genuinely impossible states (document the invariant). Commands return `Result<T, String>` with a message a user can act on; keep detail, drop jargon.
- Blocking work (processes, disk) runs in `spawn_blocking`, never on the async runtime. Never hold a mutex across an `.await`.
- Do not interpolate user text into SQL; use parameters. Do not build shell strings; pass arguments separately.
- Platform-specific code sits behind `#[cfg(...)]` with the other platform's behaviour defined, and is tested where the platform allows.
- No `unsafe` without a written justification and a test.
- Keep modules cohesive: `db` (storage and migrations), `suites`, `runs`, `hyperfine` (process), `demo`, `files`.

## 5. Tests

- **Tests are code.** They get the same care as production code: clear names (`rejects_database_from_newer_build`), one idea per test, simple assertions.
- **A test must be able to fail.** Before trusting a new test, ask what would break it. If a check can pass vacuously (an empty result, a swallowed error, a probe that returns nothing when it fails), prove it detects the bad case.
- **Use real data.** Parser fixtures are captured from real hyperfine output. Prefer running the real thing (the Rust runner tests use the real hyperfine) over mocks. Where an external tool may be missing, the test may skip itself, and says so in a comment.
- **Test behaviour and edge cases**: boundaries (0, 1, 2 samples; 5,000 cases), malformed input, unmatched cases, failure isolation, upgrades from the previous schema.
- **Statistics code needs a test for each rule**, including the direction of a delta, a CI that spans zero, and every caveat.
- Fix the cause of a flaky test or delete it. Do not retry until green, and do not loosen a timing assertion to hide a real slowdown.
- Reproduce a bug with a failing test first, then fix it.

## 6. Verify before you commit

Run what your change touches; run everything before you say a branch is ready.

```sh
npm test                                        # vitest: parser, compare, export, validation, scale
npx ng build --configuration development        # type-checks templates strictly
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test                                      # runs the real bundled hyperfine
cd .. && npm run tauri build                    # only when touching bundling, tauri.conf.json, sidecar or capabilities
```

`npm run fetch:hyperfine` must have run once so `cargo` can find the sidecar.

For UI changes, run the audit and look at the result:

```sh
npm run audit:ui                        # axe (WCAG AA) on nine screens in both themes, keyboard and focus checks
npm run audit:ui -- --shots tmp/shots   # also writes a PNG per screen and theme; open them and read them
```

It starts the dev server if needed, renders the app in headless Chrome or Edge (set `CHROME_PATH` if neither is found) with a mocked Tauri bridge (`scripts/ui-audit/mock-tauri.mjs`), and exits 1 on any failure. Add a screen to `SCREENS` in `scripts/ui-audit/audit.mjs` when you add a page or a dialog. Passing axe is necessary, not sufficient: code that compiles and passes can still look wrong, so read the screenshots.

For a refactor that must not change how anything looks, write screenshots before and after (`--shots tmp/before`, `--shots tmp/after`) and run `node scripts/ui-audit/shots-digest.mjs tmp/before tmp/after`. It compares the PNGs byte for byte and exits 1 on any difference. The rendering is deterministic (bundled fonts, fixed mock data), so any difference is a real change.

## 7. Product rules that must not regress

1. **Nothing executes without a confirmation that shows every command** (and setup, cleanup, directory). The backend runs the saved suite, not what the UI holds. No execution on startup, load, import or sample data.
2. **Never show a bare green or red delta.** A case is "faster" or "slower" only when the 95% interval of the difference excludes zero; otherwise "within noise". Surface the caveats (few runs, no stddev, cold first run, non-zero exits, configuration differences).
3. **Runs are immutable records** with the configuration snapshot they used. Do not rewrite history to match a later edit.
4. **Exports carry their own caveats and are safe to open**: CSV formula neutralisation stays; the file writer keeps its extension allowlist and absolute-path check.
5. **One benchmark at a time.** Cancel must kill the whole process tree.
6. **User data survives upgrades.** Migrations are append-only and tested from the previous version; a database from a newer build is refused, not damaged.
7. **Design:** the UI is meant to look like a calm lab notebook, not a generic dashboard template. Paper (light) and graphite (dark) themes via the CSS variables in `src/styles.css`; one accent (burnt orange) reserved for Run and focus; IBM Plex Sans and Mono with tabular numerals for data; hairline rules instead of card boxes; notes marked with a left rule; status as a dot and a word; small inline SVG icons (`IconComponent`). No pill badges, gradients, emoji or unicode glyphs used as icons. Results use distribution strips plus numbers. Commands are always monospace and shown in full. If a screen starts to look like a template, redo it.

## 8. Definition of done

- [ ] On a topic branch, in small Conventional Commits, each leaving the tree green.
- [ ] New behaviour has tests; a bug fix has a test that failed before.
- [ ] Section 6 checks pass, and you can quote the results.
- [ ] You read your whole diff. No leftover debug output, dead code, commented-out code, or stray files.
- [ ] README and plan updated if behaviour, setup or guarantees changed.
- [ ] The hand-off note says what was verified and what was not.

## Sources

- Google, [Engineering Practices: the standard of code review](https://google.github.io/eng-practices/review/reviewer/standard.html), [what to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html) and [small changes](https://google.github.io/eng-practices/review/developer/small-cls.html). Licensed CC BY 3.0. Sections 2 and 3 paraphrase and adapt them for this repository; they are not Google's text.
- Angular team, [Angular best practices for AI](https://angular.dev/assets/context/best-practices.md) (MIT). Section 4, "TypeScript and Angular", follows it.
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages.
- Rust and test rules in sections 4 and 5 are this project's own conventions, not taken from an external source.
