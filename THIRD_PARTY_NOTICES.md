# Third-party notices

BenchLab bundles or builds on the following. Licence texts for hyperfine ship inside the installer under `licenses/hyperfine/`.

| Component | Use | Licence |
|---|---|---|
| [hyperfine](https://github.com/sharkdp/hyperfine) 1.20.0 | Bundled as a sidecar binary; does all timing | Apache-2.0 OR MIT |
| [Tauri](https://tauri.app) 2 | Desktop shell | Apache-2.0 OR MIT |
| [Angular](https://angular.dev) 22 | Interface | MIT |
| [rusqlite](https://github.com/rusqlite/rusqlite) with bundled SQLite | Local storage | MIT, SQLite is public domain |
| [Chart.js](https://www.chartjs.org) 4.5 | Charts | MIT |
| [rust_xlsxwriter](https://github.com/jmcnamara/rust_xlsxwriter) | Excel export | MIT OR Apache-2.0 |
| [IBM Plex Sans and Mono](https://github.com/IBM/plex) via Fontsource | Typefaces, bundled | SIL Open Font License 1.1 |

Run `cargo license` in `src-tauri/` and `npx license-checker --production` for the complete transitive lists.
