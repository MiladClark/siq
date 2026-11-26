use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::{io::AsyncWriteExt, sync::watch};

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CancelReason {
    None,
    Pause,
    Cancel,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub phase: String,
    pub percent: u8,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_received: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_per_sec: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAvailablePayload {
    pub version: String,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLatestRelease {
    pub version: String,
    pub download_url: String,
    #[serde(default)]
    pub fallback_url: Option<String>,
    pub checksum: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub release_notes: Option<String>,
    #[serde(default)]
    pub released_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub current_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<UpdateLatestRelease>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActionResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFetchResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending: Option<UpdateAvailablePayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<UpdateCheckResult>,
}

#[derive(Clone, Debug)]
struct PendingUpdate {
    version: String,
    required: bool,
    download_url: String,
    fallback_url: Option<String>,
    checksum: String,
    size_bytes: Option<u64>,
    release_notes: Option<String>,
    origin_host: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallAttempt {
    from_version: String,
    target_version: String,
    attempted_at: u64,
}

struct UpdaterState {
    pending: Option<PendingUpdate>,
    staged_path: Option<PathBuf>,
    ready_to_install: bool,
    active: bool,
    cancel_tx: Option<watch::Sender<CancelReason>>,
    last_progress: UpdateProgress,
}

impl Default for UpdaterState {
    fn default() -> Self {
        Self {
            pending: None,
            staged_path: None,
            ready_to_install: false,
            active: false,
            cancel_tx: None,
            last_progress: UpdateProgress {
                phase: "idle".into(),
                percent: 0,
                message: String::new(),
                version: None,
                error: None,
                bytes_received: None,
                bytes_total: None,
                bytes_per_sec: None,
            },
        }
    }
}

static STATE: OnceLock<Mutex<UpdaterState>> = OnceLock::new();

fn state() -> &'static Mutex<UpdaterState> {
    STATE.get_or_init(|| Mutex::new(UpdaterState::default()))
}

fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches(['v', 'V']).to_string()
}

fn is_valid_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn validate_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main"
        || !window.url().is_ok_and(|url| {
            matches!(
                (url.scheme(), url.host_str()),
                ("https", Some("tauri.localhost")) | ("tauri", Some("localhost"))
            ) && url.port().is_none()
        })
    {
        return Err("Only the bundled siq window can run updates.".into());
    }
    Ok(())
}

fn validate_origin(origin: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(origin).map_err(|_| "Invalid siq server origin.")?;
    if parsed.scheme() != "https" || parsed.origin().ascii_serialization() != origin {
        return Err("Invalid siq server origin.".into());
    }
    Ok(parsed)
}

fn is_allowed_download_url(raw: &str, origin_host: &str) -> bool {
    let Ok(parsed) = url::Url::parse(raw) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    host.eq_ignore_ascii_case(origin_host)
        || host.eq_ignore_ascii_case("github.com")
        || host.ends_with(".githubusercontent.com")
        || host.eq_ignore_ascii_case("involved.ir")
        || host.eq_ignore_ascii_case("siq-zeta.vercel.app")
}

fn updates_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("app.siq.desktop"));
    let dir = base.join("updates");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn install_attempt_path(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("app.siq.desktop"));
    let _ = fs::create_dir_all(&base);
    base.join("pending-update-install.json")
}

fn append_log(app: &AppHandle, level: &str, message: &str) {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("app.siq.desktop"));
    let log_dir = base.join("logs");
    if fs::create_dir_all(&log_dir).is_ok() {
        let log_file = log_dir.join("updater.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(file, "{ts} [{level}] {message}");
        }
    }
}

fn emit_progress(app: &AppHandle, progress: UpdateProgress) {
    if let Ok(mut guard) = state().lock() {
        guard.last_progress = progress.clone();
    }
    let _ = app.emit("siq://update-progress", progress);
}

fn part_file_path(app: &AppHandle, version: &str) -> PathBuf {
    let safe_ver: String = normalize_version(version)
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .collect();
    updates_dir(app).join(format!("siq-{safe_ver}.exe.part"))
}

fn staged_file_path(app: &AppHandle, version: &str) -> PathBuf {
    let safe_ver: String = normalize_version(version)
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .collect();
    updates_dir(app).join(format!("siq-{safe_ver}.exe"))
}

fn compute_sha256_sync(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Could not open downloaded file: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed reading file for checksum: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    let digest = hasher.finalize();
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

fn consume_previous_install_attempt(app: &AppHandle) -> Option<UpdateProgress> {
    let marker = install_attempt_path(app);
    if !marker.exists() {
        return None;
    }
    let content = fs::read_to_string(&marker).ok();
    let _ = fs::remove_file(&marker);
    let text = content?;
    let attempt: InstallAttempt = serde_json::from_str(&text).ok()?;
    if normalize_version(&attempt.target_version) == normalize_version(CURRENT_VERSION) {
        append_log(
            app,
            "INFO",
            &format!(
                "Update completed successfully: {} -> {}",
                attempt.from_version, attempt.target_version
            ),
        );
        return None;
    }

    let err = format!(
        "The previous update to v{} did not finish. SIQ is still running v{}. Try again or download the latest build from the web app.",
        attempt.target_version, CURRENT_VERSION
    );
    append_log(app, "ERROR", &err);
    Some(UpdateProgress {
        phase: "error".into(),
        percent: 0,
        message: "Previous update did not complete".into(),
        version: Some(attempt.target_version),
        error: Some(err),
        bytes_received: None,
        bytes_total: None,
        bytes_per_sec: None,
    })
}

/// Remove any leftover `<exe>.old` binary from a prior successful in-place update.
pub fn cleanup_previous_binary(app: &AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        let old = PathBuf::from(format!("{}.old", exe.display()));
        if old.exists() {
            if fs::remove_file(&old).is_ok() {
                append_log(app, "INFO", "Cleaned up previous SIQ executable backup.");
            }
        }
    }
}

async fn query_server_updates(
    origin: &url::Url,
    force_refresh: bool,
) -> Result<UpdateCheckResult, String> {
    let mut url = origin
        .join("/api/desktop/update")
        .map_err(|_| "Could not build update check URL.")?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("version", CURRENT_VERSION);
        if force_refresh {
            pairs.append_pair("refresh", "1");
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("siq-desktop/{CURRENT_VERSION}"))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .get(url)
        .header("X-Siq-Client", "desktop")
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                "Could not reach the SIQ update server.".to_string()
            } else {
                format!("Update check failed: {e}")
            }
        })?;

    if !resp.status().is_success() {
        return Err(format!("Update server returned HTTP {}", resp.status().as_u16()));
    }

    resp.json::<UpdateCheckResult>()
        .await
        .map_err(|e| format!("Invalid update manifest from server: {e}"))
}

#[tauri::command]
pub async fn desktop_check_updates(
    window: WebviewWindow,
    origin: String,
    refresh: Option<bool>,
) -> UpdateCheckResult {
    if let Err(err) = validate_window(&window) {
        return UpdateCheckResult {
            ok: false,
            error: Some(err),
            current_version: CURRENT_VERSION.into(),
            update_available: None,
            required: None,
            latest: None,
        };
    }
    let parsed_origin = match validate_origin(&origin) {
        Ok(u) => u,
        Err(err) => {
            return UpdateCheckResult {
                ok: false,
                error: Some(err),
                current_version: CURRENT_VERSION.into(),
                update_available: None,
                required: None,
                latest: None,
            }
        }
    };

    match query_server_updates(&parsed_origin, refresh.unwrap_or(false)).await {
        Ok(res) => res,
        Err(err) => UpdateCheckResult {
            ok: false,
            error: Some(err),
            current_version: CURRENT_VERSION.into(),
            update_available: None,
            required: None,
            latest: None,
        },
    }
}

#[tauri::command]
pub async fn desktop_fetch_update(
    app: AppHandle,
    window: WebviewWindow,
    origin: String,
    refresh: Option<bool>,
) -> UpdateFetchResult {
    if let Err(err) = validate_window(&window) {
        return UpdateFetchResult {
            ok: false,
            error: Some(err),
            pending: None,
            result: None,
        };
    }

    if let Some(prev_failure) = consume_previous_install_attempt(&app) {
        let err = prev_failure.error.clone();
        emit_progress(&app, prev_failure);
        return UpdateFetchResult {
            ok: false,
            error: err,
            pending: None,
            result: None,
        };
    }

    let parsed_origin = match validate_origin(&origin) {
        Ok(u) => u,
        Err(err) => {
            return UpdateFetchResult {
                ok: false,
                error: Some(err),
                pending: None,
                result: None,
            }
        }
    };
    let origin_host = parsed_origin.host_str().unwrap_or_default().to_string();

    let result = match query_server_updates(&parsed_origin, refresh.unwrap_or(false)).await {
        Ok(r) => r,
        Err(err) => {
            return UpdateFetchResult {
                ok: false,
                error: Some(err),
                pending: None,
                result: None,
            }
        }
    };

    if !result.ok || !result.update_available.unwrap_or(false) {
        return UpdateFetchResult {
            ok: false,
            error: result.error.clone().or_else(|| Some("No update available".into())),
            pending: None,
            result: Some(result),
        };
    }

    let Some(latest) = result.latest.clone() else {
        return UpdateFetchResult {
            ok: false,
            error: Some("Release metadata is missing.".into()),
            pending: None,
            result: Some(result),
        };
    };

    if !is_valid_sha256(&latest.checksum) {
        return UpdateFetchResult {
            ok: false,
            error: Some("Release checksum is missing or invalid.".into()),
            pending: None,
            result: Some(result),
        };
    }

    if !is_allowed_download_url(&latest.download_url, &origin_host) {
        return UpdateFetchResult {
            ok: false,
            error: Some("Untrusted update download URL.".into()),
            pending: None,
            result: Some(result),
        };
    }

    let fallback_url = latest
        .fallback_url
        .filter(|u| is_allowed_download_url(u, &origin_host));

    let payload = UpdateAvailablePayload {
        version: latest.version.clone(),
        required: result.required.unwrap_or(false),
        release_notes: latest.release_notes.clone(),
        size_bytes: latest.size_bytes,
    };

    let staged = staged_file_path(&app, &latest.version);
    let already_staged = staged.exists()
        && compute_sha256_sync(&staged)
            .map(|h| h.eq_ignore_ascii_case(&latest.checksum))
            .unwrap_or(false);

    if let Ok(mut guard) = state().lock() {
        guard.pending = Some(PendingUpdate {
            version: latest.version.clone(),
            required: payload.required,
            download_url: latest.download_url.clone(),
            fallback_url,
            checksum: latest.checksum.to_lowercase(),
            size_bytes: latest.size_bytes,
            release_notes: latest.release_notes.clone(),
            origin_host,
        });
        if already_staged {
            guard.staged_path = Some(staged);
            guard.ready_to_install = true;
        } else {
            guard.staged_path = None;
            guard.ready_to_install = false;
        }
    }

    let _ = app.emit("siq://update-available", payload.clone());

    if already_staged {
        emit_progress(
            &app,
            UpdateProgress {
                phase: "ready".into(),
                percent: 100,
                message: "Update verified and ready".into(),
                version: Some(latest.version),
                error: None,
                bytes_received: latest.size_bytes,
                bytes_total: latest.size_bytes,
                bytes_per_sec: None,
            },
        );
    }

    UpdateFetchResult {
        ok: true,
        error: None,
        pending: Some(payload),
        result: Some(result),
    }
}

#[tauri::command]
pub fn desktop_get_update_state(window: WebviewWindow) -> Result<(Option<UpdateAvailablePayload>, UpdateProgress), String> {
    validate_window(&window)?;
    let guard = state().lock().map_err(|_| "Updater lock poisoned.")?;
    let pending = guard.pending.as_ref().map(|p| UpdateAvailablePayload {
        version: p.version.clone(),
        required: p.required,
        release_notes: p.release_notes.clone(),
        size_bytes: p.size_bytes,
    });
    Ok((pending, guard.last_progress.clone()))
}

async fn try_stream_download(
    app: &AppHandle,
    url: &str,
    part_path: &Path,
    version: &str,
    expected_total: Option<u64>,
    cancel_rx: &mut watch::Receiver<CancelReason>,
) -> Result<u64, (CancelReason, String)> {
    let existing_bytes = fs::metadata(part_path).map(|m| m.len()).unwrap_or(0);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .user_agent(format!("siq-desktop/{CURRENT_VERSION}"))
        .build()
        .map_err(|e| (CancelReason::None, format!("HTTP client error: {e}")))?;

    let mut req = client.get(url);
    if existing_bytes > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| (CancelReason::None, format!("Download request failed: {e}")))?;

    let status = resp.status();
    let (mut file, mut downloaded, total_bytes) = if status == reqwest::StatusCode::PARTIAL_CONTENT {
        let remaining = resp.content_length().unwrap_or(0);
        let total = if remaining > 0 {
            existing_bytes + remaining
        } else {
            expected_total.unwrap_or(0)
        };
        let f = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(part_path)
            .await
            .map_err(|e| (CancelReason::None, format!("Could not open partial file: {e}")))?;
        (f, existing_bytes, total)
    } else if status.is_success() {
        let total = resp.content_length().or(expected_total).unwrap_or(0);
        let f = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(part_path)
            .await
            .map_err(|e| (CancelReason::None, format!("Could not create download file: {e}")))?;
        (f, 0u64, total)
    } else if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && existing_bytes > 0 {
        // Stale or complete .part file — truncate and retry clean
        let _ = fs::remove_file(part_path);
        return Err((CancelReason::None, "Range reset required; retrying download.".into()));
    } else {
        return Err((
            CancelReason::None,
            format!("Server returned HTTP {} while downloading update.", status.as_u16()),
        ));
    };

    let mut stream = resp.bytes_stream();
    let mut last_emit = Instant::now();
    let mut speed_window_start = Instant::now();
    let mut speed_window_bytes: u64 = 0;
    let mut current_bps: u64 = 0;

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                let reason = *cancel_rx.borrow();
                let _ = file.flush().await;
                if reason == CancelReason::Pause {
                    return Err((CancelReason::Pause, "paused".into()));
                }
                if reason == CancelReason::Cancel {
                    return Err((CancelReason::Cancel, "Update cancelled".into()));
                }
            }
            next_chunk = stream.next() => {
                match next_chunk {
                    Some(Ok(chunk)) => {
                        file.write_all(&chunk)
                            .await
                            .map_err(|e| (CancelReason::None, format!("Disk write failed: {e}")))?;
                        let n = chunk.len() as u64;
                        downloaded += n;
                        speed_window_bytes += n;

                        let elapsed_speed = speed_window_start.elapsed().as_secs_f64();
                        if elapsed_speed >= 0.45 {
                            current_bps = (speed_window_bytes as f64 / elapsed_speed) as u64;
                            speed_window_start = Instant::now();
                            speed_window_bytes = 0;
                        }

                        if last_emit.elapsed() >= Duration::from_millis(110) {
                            let pct = if total_bytes > 0 {
                                ((downloaded as f64 / total_bytes as f64) * 100.0).round().clamp(0.0, 99.0) as u8
                            } else {
                                0
                            };
                            emit_progress(
                                app,
                                UpdateProgress {
                                    phase: "downloading".into(),
                                    percent: pct,
                                    message: "Downloading verified update…".into(),
                                    version: Some(version.to_string()),
                                    error: None,
                                    bytes_received: Some(downloaded),
                                    bytes_total: if total_bytes > 0 { Some(total_bytes) } else { None },
                                    bytes_per_sec: if current_bps > 0 { Some(current_bps) } else { None },
                                },
                            );
                            last_emit = Instant::now();
                        }
                    }
                    Some(Err(err)) => {
                        let _ = file.flush().await;
                        return Err((CancelReason::None, format!("Network stream interrupted: {err}")));
                    }
                    None => {
                        file.flush()
                            .await
                            .map_err(|e| (CancelReason::None, format!("Could not flush download: {e}")))?;
                        return Ok(downloaded);
                    }
                }
            }
        }
    }
}

async fn run_download(app: AppHandle) -> UpdateActionResult {
    let (pending, mut cancel_rx) = {
        let mut guard = match state().lock() {
            Ok(g) => g,
            Err(_) => {
                return UpdateActionResult {
                    ok: false,
                    error: Some("Updater state lock error.".into()),
                }
            }
        };
        if guard.active {
            return UpdateActionResult {
                ok: false,
                error: Some("Update already in progress".into()),
            };
        }
        if guard.ready_to_install {
            if let Some(p) = guard.pending.clone() {
                drop(guard);
                emit_progress(
                    &app,
                    UpdateProgress {
                        phase: "ready".into(),
                        percent: 100,
                        message: "Update verified and ready".into(),
                        version: Some(p.version),
                        error: None,
                        bytes_received: p.size_bytes,
                        bytes_total: p.size_bytes,
                        bytes_per_sec: None,
                    },
                );
                return UpdateActionResult { ok: true, error: None };
            }
        }
        let Some(p) = guard.pending.clone() else {
            return UpdateActionResult {
                ok: false,
                error: Some("No update available".into()),
            };
        };
        let (tx, rx) = watch::channel(CancelReason::None);
        guard.active = true;
        guard.ready_to_install = false;
        guard.cancel_tx = Some(tx);
        (p, rx)
    };

    let part_path = part_file_path(&app, &pending.version);
    let staged_path = staged_file_path(&app, &pending.version);
    let existing = fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
    let init_pct = pending
        .size_bytes
        .filter(|&t| t > 0)
        .map(|t| ((existing as f64 / t as f64) * 100.0).round().clamp(0.0, 99.0) as u8)
        .unwrap_or(0);

    emit_progress(
        &app,
        UpdateProgress {
            phase: "downloading".into(),
            percent: init_pct,
            message: if existing > 0 {
                "Resuming download…".into()
            } else {
                "Starting download…".into()
            },
            version: Some(pending.version.clone()),
            error: None,
            bytes_received: if existing > 0 { Some(existing) } else { None },
            bytes_total: pending.size_bytes,
            bytes_per_sec: None,
        },
    );

    let mut urls = vec![pending.download_url.clone()];
    if let Some(fb) = pending.fallback_url.clone() {
        if fb != pending.download_url {
            urls.push(fb);
        }
    }

    let mut download_result: Result<u64, (CancelReason, String)> =
        Err((CancelReason::None, "No valid download URL.".into()));

    for url in &urls {
        append_log(&app, "INFO", &format!("Downloading v{} from {url}", pending.version));
        match try_stream_download(
            &app,
            url,
            &part_path,
            &pending.version,
            pending.size_bytes,
            &mut cancel_rx,
        )
        .await
        {
            Ok(bytes) => {
                download_result = Ok(bytes);
                break;
            }
            Err((CancelReason::Pause, msg)) => {
                download_result = Err((CancelReason::Pause, msg));
                break;
            }
            Err((CancelReason::Cancel, msg)) => {
                download_result = Err((CancelReason::Cancel, msg));
                break;
            }
            Err((CancelReason::None, err)) => {
                append_log(&app, "WARN", &format!("Mirror failed ({url}): {err}"));
                download_result = Err((CancelReason::None, err));
            }
        }
    }

    match download_result {
        Ok(final_bytes) => {
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "verifying".into(),
                    percent: 100,
                    message: "Verifying SHA-256 checksum…".into(),
                    version: Some(pending.version.clone()),
                    error: None,
                    bytes_received: Some(final_bytes),
                    bytes_total: Some(final_bytes),
                    bytes_per_sec: None,
                },
            );

            let check_path = part_path.clone();
            let hash_res = tokio::task::spawn_blocking(move || compute_sha256_sync(&check_path))
                .await
                .map_err(|e| format!("Checksum task failed: {e}"))
                .and_then(|r| r);

            match hash_res {
                Ok(actual_hash) if actual_hash.eq_ignore_ascii_case(&pending.checksum) => {
                    let _ = fs::remove_file(&staged_path);
                    if let Err(e) = fs::rename(&part_path, &staged_path) {
                        let msg = format!("Could not stage verified update: {e}");
                        if let Ok(mut g) = state().lock() {
                            g.active = false;
                            g.cancel_tx = None;
                        }
                        emit_progress(
                            &app,
                            UpdateProgress {
                                phase: "error".into(),
                                percent: 0,
                                message: "Update failed".into(),
                                version: Some(pending.version),
                                error: Some(msg.clone()),
                                bytes_received: None,
                                bytes_total: None,
                                bytes_per_sec: None,
                            },
                        );
                        return UpdateActionResult { ok: false, error: Some(msg) };
                    }

                    if let Ok(mut g) = state().lock() {
                        g.active = false;
                        g.cancel_tx = None;
                        g.staged_path = Some(staged_path);
                        g.ready_to_install = true;
                    }
                    append_log(&app, "INFO", &format!("Verified SHA-256 for v{}", pending.version));
                    emit_progress(
                        &app,
                        UpdateProgress {
                            phase: "ready".into(),
                            percent: 100,
                            message: "Update verified and ready".into(),
                            version: Some(pending.version),
                            error: None,
                            bytes_received: Some(final_bytes),
                            bytes_total: Some(final_bytes),
                            bytes_per_sec: None,
                        },
                    );
                    UpdateActionResult { ok: true, error: None }
                }
                Ok(actual_hash) => {
                    let _ = fs::remove_file(&part_path);
                    let msg = format!(
                        "Checksum mismatch (expected {}…, got {}…). Download removed for safety.",
                        &pending.checksum[..10],
                        &actual_hash[..10.min(actual_hash.len())]
                    );
                    append_log(&app, "ERROR", &msg);
                    if let Ok(mut g) = state().lock() {
                        g.active = false;
                        g.cancel_tx = None;
                        g.ready_to_install = false;
                    }
                    emit_progress(
                        &app,
                        UpdateProgress {
                            phase: "error".into(),
                            percent: 0,
                            message: "Verification failed".into(),
                            version: Some(pending.version),
                            error: Some(msg.clone()),
                            bytes_received: None,
                            bytes_total: None,
                            bytes_per_sec: None,
                        },
                    );
                    UpdateActionResult { ok: false, error: Some(msg) }
                }
                Err(msg) => {
                    append_log(&app, "ERROR", &msg);
                    if let Ok(mut g) = state().lock() {
                        g.active = false;
                        g.cancel_tx = None;
                        g.ready_to_install = false;
                    }
                    emit_progress(
                        &app,
                        UpdateProgress {
                            phase: "error".into(),
                            percent: 0,
                            message: "Verification failed".into(),
                            version: Some(pending.version),
                            error: Some(msg.clone()),
                            bytes_received: None,
                            bytes_total: None,
                            bytes_per_sec: None,
                        },
                    );
                    UpdateActionResult { ok: false, error: Some(msg) }
                }
            }
        }
        Err((CancelReason::Pause, _)) => {
            let received = fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
            let total = pending.size_bytes;
            let pct = total
                .filter(|&t| t > 0)
                .map(|t| ((received as f64 / t as f64) * 100.0).round().clamp(0.0, 99.0) as u8)
                .unwrap_or(0);
            if let Ok(mut g) = state().lock() {
                g.active = false;
                g.cancel_tx = None;
            }
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "paused".into(),
                    percent: pct,
                    message: "Update paused".into(),
                    version: Some(pending.version),
                    error: None,
                    bytes_received: Some(received),
                    bytes_total: total,
                    bytes_per_sec: None,
                },
            );
            UpdateActionResult {
                ok: false,
                error: Some("paused".into()),
            }
        }
        Err((CancelReason::Cancel, _)) => {
            let _ = fs::remove_file(&part_path);
            let _ = fs::remove_file(&staged_path);
            if let Ok(mut g) = state().lock() {
                g.active = false;
                g.cancel_tx = None;
                g.pending = None;
                g.staged_path = None;
                g.ready_to_install = false;
            }
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "cancelled".into(),
                    percent: 0,
                    message: "Update cancelled".into(),
                    version: Some(pending.version),
                    error: None,
                    bytes_received: None,
                    bytes_total: None,
                    bytes_per_sec: None,
                },
            );
            UpdateActionResult {
                ok: false,
                error: Some("Update cancelled".into()),
            }
        }
        Err((CancelReason::None, msg)) => {
            if let Ok(mut g) = state().lock() {
                g.active = false;
                g.cancel_tx = None;
                g.ready_to_install = false;
            }
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "error".into(),
                    percent: 0,
                    message: "Update failed".into(),
                    version: Some(pending.version),
                    error: Some(msg.clone()),
                    bytes_received: None,
                    bytes_total: None,
                    bytes_per_sec: None,
                },
            );
            UpdateActionResult { ok: false, error: Some(msg) }
        }
    }
}

#[tauri::command]
pub async fn desktop_start_update(
    app: AppHandle,
    window: WebviewWindow,
    origin: String,
    version: Option<String>,
    required: Option<bool>,
) -> UpdateActionResult {
    if let Err(err) = validate_window(&window) {
        return UpdateActionResult { ok: false, error: Some(err) };
    }

    let has_pending = state()
        .lock()
        .map(|g| g.pending.is_some())
        .unwrap_or(false);

    if !has_pending {
        let fetched = desktop_fetch_update(app.clone(), window.clone(), origin, Some(false)).await;
        if !fetched.ok || fetched.pending.is_none() {
            let err = fetched.error.unwrap_or_else(|| "No update available".into());
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "error".into(),
                    percent: 0,
                    message: "Update failed".into(),
                    version,
                    error: Some(err.clone()),
                    bytes_received: None,
                    bytes_total: None,
                    bytes_per_sec: None,
                },
            );
            return UpdateActionResult { ok: false, error: Some(err) };
        }
    }

    if let Ok(mut g) = state().lock() {
        if let Some(p) = g.pending.as_mut() {
            if let Some(expected_ver) = version.as_deref() {
                if normalize_version(&p.version) != normalize_version(expected_ver) {
                    let err = format!(
                        "Update version mismatch: expected {}, got {}.",
                        expected_ver, p.version
                    );
                    return UpdateActionResult { ok: false, error: Some(err) };
                }
            }
            if let Some(req_flag) = required {
                p.required = req_flag;
            }
        }
    }

    run_download(app).await
}

#[tauri::command]
pub fn desktop_pause_update(window: WebviewWindow) -> UpdateActionResult {
    if let Err(err) = validate_window(&window) {
        return UpdateActionResult { ok: false, error: Some(err) };
    }
    if let Ok(g) = state().lock() {
        if g.active {
            if let Some(tx) = &g.cancel_tx {
                let _ = tx.send(CancelReason::Pause);
                return UpdateActionResult { ok: true, error: None };
            }
        }
    }
    UpdateActionResult {
        ok: false,
        error: Some("No active download".into()),
    }
}

#[tauri::command]
pub async fn desktop_resume_update(app: AppHandle, window: WebviewWindow) -> UpdateActionResult {
    if let Err(err) = validate_window(&window) {
        return UpdateActionResult { ok: false, error: Some(err) };
    }
    run_download(app).await
}

#[tauri::command]
pub fn desktop_cancel_update(app: AppHandle, window: WebviewWindow) -> UpdateActionResult {
    if let Err(err) = validate_window(&window) {
        return UpdateActionResult { ok: false, error: Some(err) };
    }
    let cleanup_ver = {
        let mut g = match state().lock() {
            Ok(g) => g,
            Err(_) => {
                return UpdateActionResult {
                    ok: false,
                    error: Some("Updater state error.".into()),
                }
            }
        };
        if g.active {
            if let Some(tx) = &g.cancel_tx {
                let _ = tx.send(CancelReason::Cancel);
                return UpdateActionResult { ok: true, error: None };
            }
        }
        let ver = g.pending.as_ref().map(|p| p.version.clone());
        g.pending = None;
        g.staged_path = None;
        g.ready_to_install = false;
        ver
    };

    if let Some(ver) = cleanup_ver {
        let _ = fs::remove_file(part_file_path(&app, &ver));
        let _ = fs::remove_file(staged_file_path(&app, &ver));
    }
    emit_progress(
        &app,
        UpdateProgress {
            phase: "cancelled".into(),
            percent: 0,
            message: "Update cancelled".into(),
            version: None,
            error: None,
            bytes_received: None,
            bytes_total: None,
            bytes_per_sec: None,
        },
    );
    UpdateActionResult { ok: true, error: None }
}

fn move_file_cross_volume(src: &Path, dst: &Path) -> Result<(), String> {
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    fs::copy(src, dst).map_err(|e| format!("Could not copy update binary: {e}"))?;
    let _ = fs::remove_file(src);
    Ok(())
}

#[cfg(windows)]
fn spawn_relaunch_helper(exe_path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Start-Sleep -Milliseconds 900; Start-Process -FilePath $env:SIQ_RELAUNCH_EXE",
        ])
        .env("SIQ_RELAUNCH_EXE", exe_path.as_os_str())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Could not schedule relaunch: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn spawn_relaunch_helper(_exe_path: &Path) -> Result<(), String> {
    Err("Automatic binary replacement is supported on Windows.".into())
}

#[tauri::command]
pub async fn desktop_install_update(
    app: AppHandle,
    window: WebviewWindow,
) -> UpdateActionResult {
    if let Err(err) = validate_window(&window) {
        return UpdateActionResult { ok: false, error: Some(err) };
    }

    let (pending, staged_path) = {
        let g = match state().lock() {
            Ok(g) => g,
            Err(_) => {
                return UpdateActionResult {
                    ok: false,
                    error: Some("Updater state error.".into()),
                }
            }
        };
        if !g.ready_to_install {
            return UpdateActionResult {
                ok: false,
                error: Some("No verified update is ready to install.".into()),
            };
        }
        let Some(p) = g.pending.clone() else {
            return UpdateActionResult {
                ok: false,
                error: Some("No pending update.".into()),
            };
        };
        let Some(s) = g.staged_path.clone() else {
            return UpdateActionResult {
                ok: false,
                error: Some("Staged update file not found.".into()),
            };
        };
        (p, s)
    };

    emit_progress(
        &app,
        UpdateProgress {
            phase: "applying".into(),
            percent: 100,
            message: "Applying verified update…".into(),
            version: Some(pending.version.clone()),
            error: None,
            bytes_received: None,
            bytes_total: None,
            bytes_per_sec: None,
        },
    );

    // Re-verify SHA-256 right before swapping executables
    let verify_path = staged_path.clone();
    let verified_ok = tokio::task::spawn_blocking(move || compute_sha256_sync(&verify_path))
        .await
        .ok()
        .and_then(|r| r.ok())
        .map(|h| h.eq_ignore_ascii_case(&pending.checksum))
        .unwrap_or(false);

    if !verified_ok {
        let msg = "Staged update failed integrity check before install.";
        emit_progress(
            &app,
            UpdateProgress {
                phase: "error".into(),
                percent: 0,
                message: "Verification failed".into(),
                version: Some(pending.version),
                error: Some(msg.into()),
                bytes_received: None,
                bytes_total: None,
                bytes_per_sec: None,
            },
        );
        return UpdateActionResult {
            ok: false,
            error: Some(msg.into()),
        };
    }

    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("Could not locate running SIQ executable: {e}");
            emit_progress(
                &app,
                UpdateProgress {
                    phase: "error".into(),
                    percent: 0,
                    message: "Install failed".into(),
                    version: Some(pending.version),
                    error: Some(msg.clone()),
                    bytes_received: None,
                    bytes_total: None,
                    bytes_per_sec: None,
                },
            );
            return UpdateActionResult { ok: false, error: Some(msg) };
        }
    };

    let backup_exe = PathBuf::from(format!("{}.old", current_exe.display()));
    let _ = fs::remove_file(&backup_exe);

    if let Err(e) = fs::rename(&current_exe, &backup_exe) {
        let msg = format!(
            "Could not replace SIQ in {}. Make sure the folder is writable ({e}).",
            current_exe
                .parent()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        );
        append_log(&app, "ERROR", &msg);
        emit_progress(
            &app,
            UpdateProgress {
                phase: "error".into(),
                percent: 0,
                message: "Install failed".into(),
                version: Some(pending.version),
                error: Some(msg.clone()),
                bytes_received: None,
                bytes_total: None,
                bytes_per_sec: None,
            },
        );
        return UpdateActionResult { ok: false, error: Some(msg) };
    }

    if let Err(msg) = move_file_cross_volume(&staged_path, &current_exe) {
        // Restore original binary immediately on failure
        let _ = fs::rename(&backup_exe, &current_exe);
        append_log(&app, "ERROR", &msg);
        emit_progress(
            &app,
            UpdateProgress {
                phase: "error".into(),
                percent: 0,
                message: "Install failed".into(),
                version: Some(pending.version),
                error: Some(msg.clone()),
                bytes_received: None,
                bytes_total: None,
                bytes_per_sec: None,
            },
        );
        return UpdateActionResult { ok: false, error: Some(msg) };
    }

    // Write install attempt marker so next boot confirms upgrade succeeded
    let attempt = InstallAttempt {
        from_version: CURRENT_VERSION.into(),
        target_version: pending.version.clone(),
        attempted_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    if let Ok(json) = serde_json::to_string_pretty(&attempt) {
        let _ = fs::write(install_attempt_path(&app), json);
    }

    emit_progress(
        &app,
        UpdateProgress {
            phase: "restarting".into(),
            percent: 100,
            message: "Restarting SIQ…".into(),
            version: Some(pending.version.clone()),
            error: None,
            bytes_received: None,
            bytes_total: None,
            bytes_per_sec: None,
        },
    );

    if let Err(msg) = spawn_relaunch_helper(&current_exe) {
        let _ = fs::remove_file(install_attempt_path(&app));
        append_log(&app, "ERROR", &msg);
        emit_progress(
            &app,
            UpdateProgress {
                phase: "error".into(),
                percent: 0,
                message: "Restart failed".into(),
                version: Some(pending.version),
                error: Some(msg.clone()),
                bytes_received: None,
                bytes_total: None,
                bytes_per_sec: None,
            },
        );
        return UpdateActionResult { ok: false, error: Some(msg) };
    }

    append_log(
        &app,
        "INFO",
        &format!("Swapped executable v{} -> v{}; restarting SIQ.", CURRENT_VERSION, pending.version),
    );

    // Give the webview a brief moment to render the "Restarting SIQ…" phase before exiting
    let app_for_exit = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(180)).await;
        app_for_exit.exit(0);
    });

    UpdateActionResult { ok: true, error: None }
}
