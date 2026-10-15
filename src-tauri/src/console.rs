use std::process::Command;

/// The release build is a GUI app with no console, so Windows gives every console program
/// it starts (hyperfine, git, reg, taskkill) a window of its own unless told not to. The
/// shells hyperfine starts for each timed run inherit the hidden console, so this also keeps
/// the benchmarked commands from opening windows. Other platforms have nothing to hide.
pub fn without_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
