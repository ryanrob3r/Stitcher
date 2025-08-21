# Simple helper tasks for Stitcher (Wails + Go + React)

SHELL := /bin/bash
FRONTEND_DIR := frontend

.PHONY: help deps dev build go-build frontend-install frontend-dev frontend-build fmt test clean

help:
	@echo "Targets: deps dev build go-build frontend-install frontend-dev frontend-build fmt test clean"

# Install frontend dependencies (CI-friendly)
deps: frontend-install

dev:
	wails dev

build:
	wails build

go-build:
	go build ./...

frontend-install:
	cd $(FRONTEND_DIR) && npm ci

frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

frontend-build:
	cd $(FRONTEND_DIR) && npm run build

fmt:
	go fmt ./...

test:
	go test ./...

clean:
	rm -rf $(FRONTEND_DIR)/dist build/bin || true

