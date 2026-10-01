.PHONY: dev build test format format-check

dev:
	@./scripts/dev.sh

build:
	cd web && npm ci && npm run build
	cd server && cargo build --release

test:
	cd web && npm run test
	cd server && cargo test

format:
	cd web && npm run format
	cd server && cargo fmt --all

format-check:
	cd web && npm run format:check
	cd server && cargo fmt --all -- --check
