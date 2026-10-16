//! Where BenchLab keeps its files.

pub mod commands;

/// Debug builds keep their own database, so running `tauri dev` on a newer schema never
/// upgrades the data of an installed build (which would then refuse to start).
pub const DATABASE_FILE: &str = if cfg!(debug_assertions) {
    "benchlab-dev.db"
} else {
    "benchlab.db"
};

/// The app's own log, in the platform's log folder (on Windows
/// `%LOCALAPPDATA%\com.benchlab.main\logs`). Debug builds write their own file, as with the database.
pub const LOG_FILE: &str = if cfg!(debug_assertions) {
    "benchlab-dev"
} else {
    "benchlab"
};
