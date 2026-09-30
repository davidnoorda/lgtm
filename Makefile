.PHONY: dev build test

dev:
	@./scripts/dev.sh

build:
	cd web && npm ci && npm run build
	cd server && cargo build --release

test:
	cd web && npm run test
	cd server && cargo test
