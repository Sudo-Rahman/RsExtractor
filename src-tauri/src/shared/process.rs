pub(crate) fn terminate_process(pid: u32) {
    if pid == 0 {
        return;
    }

    #[cfg(unix)]
    {
        // SAFETY: Best-effort process termination for a known PID.
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
    }
}

pub(crate) fn force_terminate_process(pid: u32) {
    if pid == 0 {
        return;
    }

    #[cfg(unix)]
    {
        // SAFETY: Best-effort forced process termination for a known PID.
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
}

#[cfg(test)]
mod tests {
    use std::process::{Child, Command, ExitStatus, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    use super::force_terminate_process;

    #[test]
    fn force_terminate_process_ignores_zero_pid() {
        force_terminate_process(0);
    }

    #[test]
    fn force_terminate_process_stops_running_process() {
        let mut child = spawn_sleeping_child();
        let pid = child.id();

        force_terminate_process(pid);

        let status = wait_for_child_exit(&mut child).unwrap_or_else(|| {
            let _ = child.kill();
            let _ = child.wait();
            panic!("force_terminate_process did not stop child process");
        });

        assert!(!status.success());
    }

    #[cfg(unix)]
    fn spawn_sleeping_child() -> Child {
        Command::new("sleep")
            .arg("30")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("failed to spawn sleep process")
    }

    #[cfg(windows)]
    fn spawn_sleeping_child() -> Child {
        Command::new("cmd")
            .args(["/C", "ping -n 30 127.0.0.1 >NUL"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("failed to spawn ping process")
    }

    fn wait_for_child_exit(child: &mut Child) -> Option<ExitStatus> {
        let timeout = Duration::from_secs(3);
        let started_at = Instant::now();

        while started_at.elapsed() < timeout {
            if let Some(status) = child.try_wait().expect("failed to poll child process") {
                return Some(status);
            }

            thread::sleep(Duration::from_millis(25));
        }

        None
    }
}
