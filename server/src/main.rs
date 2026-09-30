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

#[derive(Clone)]
struct App {
    repo: PathBuf,
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
async fn api_overview(State(app): State<Arc<App>>) -> Result<Json<Overview>, ApiError> {
    Ok(Json(overview(&app.repo)?))
}
async fn api_file(
    State(app): State<Arc<App>>,
    Path(path): Path<String>,
) -> Result<Json<FileView>, ApiError> {
    // Only allow paths currently reported by Git; never accept arbitrary client file paths.
    let entry = overview(&app.repo)?
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
        let result = git(&app.repo, &["show", &format!("HEAD:{}", path)])?;
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
        let target = app.repo.join(&path);
        // Reject symlinks (including symlinked parents) and paths escaping the repository.
        let canonical = target
            .canonicalize()
            .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
        if !canonical.starts_with(&app.repo) || !canonical.is_file() {
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
        None => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arg = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let output = git(FsPath::new(&arg), &["rev-parse", "--show-toplevel"])
        .map_err(|(_, message)| message)?;
    if !output.status.success() {
        return Err(format!("Not a git repository: {arg}").into());
    }
    let repo = PathBuf::from(String::from_utf8(output.stdout)?.trim());
    let app = Arc::new(App { repo });
    let router = Router::new()
        .route("/api/overview", get(api_overview))
        .route("/api/file/{*path}", get(api_file))
        .route("/", get(|| frontend(Path(String::new()))))
        .route("/{*path}", get(frontend))
        .with_state(app);
    let port = std::env::var("LGTM_PORT").unwrap_or_else(|_| "0".into());
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await?;
    let url = format!("http://{}", listener.local_addr()?);
    println!("LGTM: {url}");
    if std::env::var("LGTM_NO_OPEN").is_err() {
        let _ = open::that(&url);
    }
    axum::serve(listener, router).await?;
    Ok(())
}
