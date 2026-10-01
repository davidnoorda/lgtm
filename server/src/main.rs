#[cfg(test)]
mod slug_tests;
#[cfg(test)]
mod tests;

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use include_dir::{include_dir, Dir};
static UI: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../web/dist");
use serde::Serialize;
use std::{
    path::{Path as FsPath, PathBuf},
    process::Command,
    sync::Arc,
};

struct App {
    repos: std::sync::RwLock<std::collections::BTreeMap<String, PathBuf>>,
    token: String,
    registry: PathBuf,
}
#[derive(Serialize)]
struct FileEntry {
    path: String,
    status: String,
}
#[derive(Serialize)]
struct Overview {
    repo: String,
    head: String,
    files: Vec<FileEntry>,
}
#[derive(Serialize)]
struct FileView {
    path: String,
    old: Option<String>,
    new: Option<String>,
}

type ApiError = (StatusCode, String);
fn git(repo: &FsPath, args: &[&str]) -> Result<std::process::Output, ApiError> {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
fn overview(repo: &FsPath) -> Result<Overview, ApiError> {
    // -uall lists individual untracked files; --no-renames treats moves as add/delete.
    let output = git(
        repo,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--no-renames",
        ],
    )?;
    if !output.status.success() {
        return Err((
            StatusCode::BAD_REQUEST,
            String::from_utf8_lossy(&output.stderr).into(),
        ));
    }
    let files = output
        .stdout
        .split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .filter_map(|r| {
            if r.len() < 4 {
                return None;
            }
            let path = String::from_utf8(r[3..].to_vec()).ok()?;
            let status = if &r[..2] == b"??" {
                "untracked"
            } else if r[..2].contains(&b'D') {
                "deleted"
            } else if r[..2].contains(&b'A') {
                "added"
            } else {
                "modified"
            };
            Some(FileEntry {
                path,
                status: status.into(),
            })
        })
        .collect();
    let head = git(repo, &["rev-parse", "--short", "HEAD"])?;
    let head = if head.status.success() {
        String::from_utf8_lossy(&head.stdout).trim().to_owned()
    } else {
        "(no commits)".into()
    };
    Ok(Overview {
        repo: repo.to_string_lossy().into(),
        head,
        files,
    })
}
fn repository(app: &App, id: &str) -> Result<PathBuf, ApiError> {
    app.repos
        .read()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or((StatusCode::NOT_FOUND, "Unknown repository".into()))
}
async fn api_repositories(
    State(app): State<Arc<App>>,
) -> Json<std::collections::BTreeMap<String, PathBuf>> {
    let repos = app.repos.read().unwrap();
    Json(
        repos
            .iter()
            .filter(|(id, path)| {
                !repos
                    .iter()
                    .any(|(other, p)| p == *path && other != *id && is_friendly_id(other, path))
            })
            .map(|(id, path)| (id.clone(), path.clone()))
            .collect(),
    )
}
async fn api_overview(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<Overview>, ApiError> {
    Ok(Json(overview(&repository(&app, &id)?)?))
}
fn repo_slug(repo: &FsPath) -> String {
    let name = repo
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let slug = name
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "repo".into()
    } else {
        slug
    }
}
fn is_friendly_id(id: &str, repo: &FsPath) -> bool {
    let base = repo_slug(repo);
    id == base
        || id
            .strip_prefix(&format!("{base}-"))
            .is_some_and(|suffix| suffix.parse::<usize>().is_ok_and(|n| n >= 2))
}
fn register(app: &App, path: &str) -> Result<String, ApiError> {
    let result = git(FsPath::new(path), &["rev-parse", "--show-toplevel"])?;
    if !result.status.success() {
        return Err((StatusCode::BAD_REQUEST, "Not a Git repository".into()));
    }
    let repo = PathBuf::from(String::from_utf8_lossy(&result.stdout).trim())
        .canonicalize()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let mut repos = app.repos.write().unwrap();
    if let Some((id, _)) = repos
        .iter()
        .find(|(id, path)| **path == repo && is_friendly_id(id, &repo))
    {
        return Ok(id.clone());
    }
    let base = repo_slug(&repo);
    let mut id = base.clone();
    let mut suffix = 2;
    while repos.contains_key(&id) {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    repos.insert(id.clone(), repo);
    let bytes = serde_json::to_vec(&*repos)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let temporary = app.registry.with_extension("tmp");
    std::fs::write(&temporary, bytes)
        .and_then(|_| std::fs::rename(&temporary, &app.registry))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(id)
}
async fn api_register(
    State(app): State<Arc<App>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> Result<String, ApiError> {
    if headers.get("authorization").and_then(|h| h.to_str().ok()) != Some(app.token.as_str()) {
        return Err((StatusCode::UNAUTHORIZED, "Invalid local token".into()));
    }
    register(&app, &body)
}
async fn api_tree(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<FileEntry>>, ApiError> {
    let repo = repository(&app, &id)?;
    let output = git(
        &repo,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let mut paths: Vec<String> = output
        .stdout
        .split(|b| *b == 0)
        .filter_map(|p| String::from_utf8(p.to_vec()).ok())
        .filter(|p| !p.is_empty() && repo.join(p).is_file())
        .collect();
    paths.sort();
    paths.dedup();
    Ok(Json(
        paths
            .into_iter()
            .map(|path| FileEntry {
                path,
                status: "file".into(),
            })
            .collect(),
    ))
}
async fn api_contents(
    State(app): State<Arc<App>>,
    Path((id, path)): Path<(String, String)>,
) -> Result<Json<FileView>, ApiError> {
    let repo = repository(&app, &id)?;
    let target = repo
        .join(&path)
        .canonicalize()
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let listed = git(
        &repo,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    if !target.starts_with(&repo)
        || !target.is_file()
        || !listed
            .stdout
            .split(|b| *b == 0)
            .any(|p| p == path.as_bytes())
    {
        return Err((StatusCode::FORBIDDEN, "Not a repository file".into()));
    }
    let new = std::fs::read_to_string(target)
        .map_err(|e| (StatusCode::UNSUPPORTED_MEDIA_TYPE, e.to_string()))?;
    Ok(Json(FileView {
        path,
        old: None,
        new: Some(new),
    }))
}
async fn api_file(
    State(app): State<Arc<App>>,
    Path((id, path)): Path<(String, String)>,
) -> Result<Json<FileView>, ApiError> {
    let repo = repository(&app, &id)?;
    // Only allow paths currently reported by Git; never accept arbitrary client file paths.
    let entry = overview(&repo)?
        .files
        .into_iter()
        .find(|e| e.path == path)
        .ok_or((
            StatusCode::NOT_FOUND,
            "File is not in the current changes".into(),
        ))?;
    let old = if entry.status == "added" || entry.status == "untracked" {
        None
    } else {
        let result = git(&repo, &["show", &format!("HEAD:{}", path)])?;
        if result.status.success() {
            Some(
                String::from_utf8(result.stdout)
                    .map_err(|_| (StatusCode::UNSUPPORTED_MEDIA_TYPE, "Binary file".into()))?,
            )
        } else {
            None
        }
    };
    let new = if entry.status == "deleted" {
        None
    } else {
        let target = repo.join(&path);
        // Reject symlinks (including symlinked parents) and paths escaping the repository.
        let canonical = target
            .canonicalize()
            .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
        if !canonical.starts_with(&repo) || !canonical.is_file() {
            return Err((
                StatusCode::FORBIDDEN,
                "Not a regular file inside the repository".into(),
            ));
        }
        let bytes = std::fs::read(canonical)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Some(
            String::from_utf8(bytes)
                .map_err(|_| (StatusCode::UNSUPPORTED_MEDIA_TYPE, "Binary file".into()))?,
        )
    };
    Ok(Json(FileView { path, old, new }))
}

async fn frontend(Path(path): Path<String>) -> impl IntoResponse {
    let path = if path.is_empty() {
        "index.html"
    } else {
        path.as_str()
    };
    match UI.get_file(path) {
        Some(file) => (
            StatusCode::OK,
            [(
                header::CONTENT_TYPE,
                mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .as_ref()
                    .to_owned(),
            )],
            file.contents().to_vec(),
        )
            .into_response(),
        None => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html")],
            UI.get_file("index.html").unwrap().contents().to_vec(),
        )
            .into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Read;
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("Usage: lgtm [open] [PATH] [--changes]\n       lgtm serve\n\nOpens/registers a Git repository with the running local server.\nIf none is running, starts serving in the foreground. Requires curl.\nUse LGTM_PORT to choose a fixed port; LGTM_NO_OPEN=1 suppresses the browser.");
        return Ok(());
    }
    if args.iter().any(|a| a.starts_with("--") && a != "--changes") {
        return Err("Unknown option; use --help".into());
    }
    let serving = args.first().map(String::as_str) == Some("serve");
    let path = args
        .iter()
        .filter(|a| a.as_str() != "open" && a.as_str() != "serve" && !a.starts_with("--"))
        .next()
        .cloned()
        .unwrap_or_else(|| ".".into());
    let view = if args.iter().any(|a| a == "--changes") {
        "files?changed=1"
    } else {
        "files"
    };
    let runtime = PathBuf::from(
        std::env::var("LGTM_RUNTIME_DIR").or_else(|_| std::env::var("XDG_RUNTIME_DIR"))?,
    );
    std::fs::create_dir_all(&runtime)?;
    let discovery = runtime.join("lgtm-server.json");
    let absolute = std::env::current_dir()?.join(&path);
    if !serving {
        if let Ok(bytes) = std::fs::read(&discovery) {
            if let Ok(info) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let (Some(url), Some(token)) = (info["url"].as_str(), info["token"].as_str()) {
                    let response = Command::new("curl")
                        .args([
                            "--silent",
                            "--show-error",
                            "--fail",
                            "--max-time",
                            "3",
                            "--noproxy",
                            "*",
                            "-H",
                            &format!("Authorization: {token}"),
                            "--data-binary",
                            &absolute.to_string_lossy(),
                            &format!("{url}/api/register"),
                        ])
                        .output()?;
                    if response.status.success() {
                        let id = String::from_utf8(response.stdout)?;
                        let target = format!("{url}/r/{id}/{view}");
                        println!("{target}");
                        if std::env::var("LGTM_NO_OPEN").is_err() {
                            open::that(target)?;
                        }
                        return Ok(());
                    }
                    // Do not silently create another server if a live server rejected registration.
                    if response.status.code() == Some(22) {
                        return Err("Repository registration failed".into());
                    }
                }
            }
        }
    }
    use std::os::unix::fs::OpenOptionsExt;
    let server_lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .open(runtime.join("lgtm-server.lock"))?;
    server_lock
        .try_lock()
        .map_err(|_| "LGTM is already running (or starting); try lgtm open again")?;
    let mut random = [0u8; 32];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut random)?;
    let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let state = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap()).join(".local/state"))
        .join("lgtm");
    std::fs::create_dir_all(&state)?;
    let registry = state.join("repositories.json");
    let repos = match std::fs::read(&registry) {
        Ok(bytes) => serde_json::from_slice(&bytes)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Default::default(),
        Err(e) => return Err(e.into()),
    };
    let app = Arc::new(App {
        repos: std::sync::RwLock::new(repos),
        token: token.clone(),
        registry,
    });
    // Upgrade registered repositories to friendly routes, keeping legacy IDs as aliases.
    let registered: Vec<PathBuf> = app.repos.read().unwrap().values().cloned().collect();
    for repo in registered {
        let _ = register(&app, &repo.to_string_lossy());
    }
    let initial = if serving {
        None
    } else {
        Some(register(&app, &absolute.to_string_lossy()).map_err(|(_, e)| e)?)
    };
    let router = Router::new()
        .route("/api/repositories", get(api_repositories))
        .route("/api/register", axum::routing::post(api_register))
        .route("/api/r/{id}/overview", get(api_overview))
        .route("/api/r/{id}/tree", get(api_tree))
        .route("/api/r/{id}/contents/{*path}", get(api_contents))
        .route("/api/r/{id}/file/{*path}", get(api_file))
        .route("/", get(|| frontend(Path(String::new()))))
        .route("/{*path}", get(frontend))
        .with_state(app);
    let port = std::env::var("LGTM_PORT").unwrap_or_else(|_| "0".into());
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await?;
    let url = format!("http://{}", listener.local_addr()?);
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&discovery)?;
    file.write_all(
        serde_json::to_string(&serde_json::json!({"url": url, "token": token}))?.as_bytes(),
    )?;
    let target = initial
        .map(|id| format!("{url}/r/{id}/{view}"))
        .unwrap_or_else(|| format!("{url}/scratch/new"));
    println!("LGTM: {target}");
    if std::env::var("LGTM_NO_OPEN").is_err() {
        let _ = open::that(&target);
    }
    axum::serve(listener, router).await?;
    Ok(())
}
