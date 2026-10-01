use std::{
    fs::{File, OpenOptions},
    io,
    path::{Path, PathBuf},
};

pub fn state_dir() -> io::Result<PathBuf> {
    if let Some(path) = std::env::var_os("LGTM_STATE_DIR") {
        return Ok(path.into());
    }
    #[cfg(target_os = "linux")]
    let base = dirs::state_dir();
    #[cfg(not(target_os = "linux"))]
    let base = dirs::data_local_dir();
    base.map(|path| path.join("lgtm"))
        .ok_or_else(|| io::Error::other("Cannot determine the user data directory"))
}

pub fn runtime_dir() -> io::Result<PathBuf> {
    if let Some(path) = std::env::var_os("LGTM_RUNTIME_DIR") {
        return Ok(path.into());
    }
    #[cfg(target_os = "linux")]
    if let Some(path) = std::env::var_os("XDG_RUNTIME_DIR") {
        return Ok(PathBuf::from(path).join("lgtm"));
    }
    Ok(state_dir()?.join("runtime"))
}

// Never put the local authentication token in a shared temporary directory.
// Windows uses the current user's profile directory and its inherited ACLs.
pub fn create_private_dir(path: &Path) -> io::Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

pub fn private_file(path: &Path, truncate: bool) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .truncate(truncate);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_files_and_directories() {
        let mut random = [0u8; 8];
        getrandom::fill(&mut random).unwrap();
        let path =
            std::env::temp_dir().join(format!("lgtm-platform-{:x}", u64::from_le_bytes(random)));
        create_private_dir(&path).unwrap();
        let file = private_file(&path.join("token"), false).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(file.metadata().unwrap().permissions().mode() & 0o777, 0o600);
        }
        drop(file);
        std::fs::remove_dir_all(path).unwrap();
    }
}
