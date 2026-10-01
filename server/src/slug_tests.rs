use super::*;

#[tokio::test]
async fn friendly_names_collisions_and_legacy_aliases() {
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).unwrap();
    let root = std::env::temp_dir().join(format!(
        "lgtm-slugs-{}-{:x}",
        std::process::id(),
        u128::from_le_bytes(nonce)
    ));
    let first = root.join("one/My Project");
    let second = root.join("two/My Project");
    for repo in [&first, &second] {
        std::fs::create_dir_all(repo).unwrap();
        assert!(git(repo, &["init", "-q"]).unwrap().status.success());
    }
    let app = Arc::new(App {
        repos: Default::default(),
        token: "token".into(),
        registry: root.join("registry.json"),
    });
    app.repos
        .write()
        .unwrap()
        .insert("deadbeefdeadbeef".into(), first.canonicalize().unwrap());
    assert_eq!(
        register(&app, first.to_str().unwrap()).unwrap(),
        "my-project"
    );
    assert_eq!(
        register(&app, second.to_str().unwrap()).unwrap(),
        "my-project-2"
    );
    assert_eq!(
        register(&app, second.to_str().unwrap()).unwrap(),
        "my-project-2"
    );
    assert_eq!(
        repository(&app, "deadbeefdeadbeef").unwrap(),
        first.canonicalize().unwrap()
    );
    let Json(list) = api_repositories(State(app)).await;
    assert_eq!(list.len(), 2);
    assert!(list.contains_key("my-project"));
    assert!(list.contains_key("my-project-2"));
    assert!(!list.contains_key("deadbeefdeadbeef"));
    std::fs::remove_dir_all(root).unwrap();
}
