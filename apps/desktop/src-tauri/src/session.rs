use tauri::WebviewWindow;

fn credential_target(window: &WebviewWindow, origin: &str) -> Result<Vec<u16>, String> {
    if window.label() != "main"
        || !window.url().is_ok_and(|url| {
            matches!(
                (url.scheme(), url.host_str()),
                ("https", Some("tauri.localhost")) | ("tauri", Some("localhost"))
            ) && url.port().is_none()
        })
    {
        return Err("Only the bundled siq window can access the session.".into());
    }
    let server = url::Url::parse(origin).map_err(|_| "Invalid siq server origin.")?;
    if server.scheme() != "https" || server.origin().ascii_serialization() != origin {
        return Err("Invalid siq server origin.".into());
    }
    Ok(format!("siq desktop session: {origin}")
        .encode_utf16()
        .chain([0])
        .collect())
}

#[tauri::command]
pub fn desktop_load_session(
    window: WebviewWindow,
    origin: String,
) -> Result<Option<String>, String> {
    read_credential(&credential_target(&window, &origin)?)
}

#[tauri::command]
pub fn desktop_save_session(
    window: WebviewWindow,
    origin: String,
    token: Option<String>,
) -> Result<(), String> {
    write_credential(&credential_target(&window, &origin)?, token)
}

#[cfg(windows)]
mod windows {
    use std::{io, ptr, slice};
    use windows_sys::Win32::{
        Foundation::ERROR_NOT_FOUND,
        Security::Credentials::{
            CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW,
            CRED_MAX_CREDENTIAL_BLOB_SIZE, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        },
    };

    fn missing(error: &io::Error) -> bool {
        error.raw_os_error() == Some(ERROR_NOT_FOUND as i32)
    }

    pub(super) fn read_credential(target: &[u16]) -> Result<Option<String>, String> {
        let mut credential = ptr::null_mut();
        // The target is NUL-terminated. Windows owns the read result until CredFree.
        unsafe {
            if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
                let error = io::Error::last_os_error();
                return if missing(&error) {
                    Ok(None)
                } else {
                    Err(error.to_string())
                };
            }
            let blob = &*credential;
            let token = if blob.CredentialBlobSize == 0 {
                None
            } else {
                let bytes =
                    slice::from_raw_parts(blob.CredentialBlob, blob.CredentialBlobSize as usize);
                std::str::from_utf8(bytes).ok().map(str::to_owned)
            };
            CredFree(credential.cast());
            Ok(token)
        }
    }

    pub(super) fn write_credential(target: &[u16], token: Option<String>) -> Result<(), String> {
        if let Some(token) = token {
            let mut bytes = token.into_bytes();
            if bytes.is_empty() || bytes.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
                return Err("Invalid siq session token size.".into());
            }
            let credential = CREDENTIALW {
                Type: CRED_TYPE_GENERIC,
                TargetName: target.as_ptr().cast_mut(),
                CredentialBlobSize: bytes.len() as u32,
                CredentialBlob: bytes.as_mut_ptr(),
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                ..Default::default()
            };
            // Both the target and credential data live through the Windows call.
            if unsafe { CredWriteW(&credential, 0) } == 0 {
                return Err(io::Error::last_os_error().to_string());
            }
        } else if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
            let error = io::Error::last_os_error();
            if !missing(&error) {
                return Err(error.to_string());
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
use windows::{read_credential, write_credential};

#[cfg(not(windows))]
fn read_credential(_target: &[u16]) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(windows))]
fn write_credential(_target: &[u16], token: Option<String>) -> Result<(), String> {
    if token.is_some() {
        return Err("Saving a session is supported on Windows.".into());
    }
    Ok(())
}
