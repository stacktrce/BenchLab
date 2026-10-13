//! Locating and running hyperfine. Commands reach hyperfine as single argv entries;
//! we never build shell strings ourselves (hyperfine runs them in its own shell).

pub mod commands;
mod control;
mod locate;
mod process;
mod tree;

pub use control::RunControl;
pub use locate::{locate_hyperfine, tool_version};
pub use process::{Job, exec};
