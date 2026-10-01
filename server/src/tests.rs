use super::*;

fn fixture() -> (Arc<App>, PathBuf) {
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).unwrap();
    let root = std::env::temp_dir().join(format!(
        "lgtm-test-{}-{:x}",
        std::process::id(),
        u128::from_le_bytes(nonce)
    ));
    std::fs::create_dir_all(&root).unwrap();
    let init = git(&root, &["init", "-q"]).unwrap();
    assert!(
        init.status.success(),
        "{}",
        String::from_utf8_lossy(&init.stderr)
    );
    std::fs::write(root.join("hello.md"), "hello world\n").unwrap();
    std::fs::write(root.join(".gitignore"), "secret\n").unwrap();
    std::fs::write(root.join("secret"), "private").unwrap();
    let app = Arc::new(App {
        repos: Default::default(),
        token: "test-token".into(),
        registry: root.join(".git/registry.json"),
    });
    (app, root)
}

#[tokio::test]
async fn registration_tree_and_contents() {
    let (app, root) = fixture();
    let id = register(&app, root.to_str().unwrap()).unwrap();
    assert_eq!(
        id,
        register(&app, root.join(".").to_str().unwrap()).unwrap()
    );
    assert_eq!(app.repos.read().unwrap().len(), 1);
    assert_eq!(id, repo_slug(&root));
    let Json(tree) = api_tree(State(app.clone()), Path(id.clone()))
        .await
        .unwrap();
    assert!(tree.iter().any(|e| e.path == "hello.md"));
    assert!(!tree.iter().any(|e| e.path == "secret"));
    let Json(file) = api_contents(State(app.clone()), Path((id.clone(), "hello.md".into())))
        .await
        .unwrap();
    assert_eq!(file.new.as_deref(), Some("hello world\n"));
    for path in ["secret", ".git/config", "../outside"] {
        assert!(
            api_contents(State(app.clone()), Path((id.clone(), path.into())))
                .await
                .is_err()
        );
    }
    assert!(api_register(
        State(app.clone()),
        Default::default(),
        root.to_string_lossy().into()
    )
    .await
    .is_err());
    let loaded: std::collections::BTreeMap<String, PathBuf> =
        serde_json::from_slice(&std::fs::read(&app.registry).unwrap()).unwrap();
    assert!(loaded.contains_key(&id));
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn external_symlink_is_rejected() {
    let (app, root) = fixture();
    let outside = root.with_extension("outside");
    std::fs::write(&outside, "private").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
    let id = register(&app, root.to_str().unwrap()).unwrap();
    assert!(api_contents(State(app), Path((id, "escape".into())))
        .await
        .is_err());
    std::fs::remove_dir_all(root).unwrap();
    std::fs::remove_file(outside).unwrap();
}
