// Without this attribute a release build opens a console window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    benchlab_lib::run()
}
