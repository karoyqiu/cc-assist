# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cc-assist is a Tauri 2.0 desktop application with a React 19 + TypeScript frontend and a Rust backend. Created from `ppnpm create tauri-app`.

## Development Commands

```bash
# Install dependencies
pnpm install

# Frontend-only dev server (port 1420)
pnpm run dev

# Full Tauri dev (frontend + Rust backend with hot reload)
pnpm run tauri dev

# Production build
pnpm run tauri build

# TypeScript type checking
pnpm tsc --noEmit

# Lint Rust code
cargo clippy --manifest-path src-tauri/Cargo.toml
```

## Architecture

- **`src/`** — React frontend. Entry at `main.tsx` → `App.tsx`. Communicates with Rust via `@tauri-apps/api/core` `invoke()`.
- **`src-tauri/src/`** — Rust backend. `main.rs` is the entry point, `lib.rs` registers Tauri commands and plugins. Add new commands with `#[tauri::command]` and register them in `generate_handler![]`.
- **`src-tauri/capabilities/`** — Tauri security permissions per window. New capabilities must be declared here.
- **`src-tauri/tauri.conf.json`** — App config (window size, CSP, build commands, bundle settings). Note: build commands reference `ppnpm` despite using `pnpm`.
- **`docs/solutions/`** — Documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`).

## Key Conventions

- Tauri commands go in `src-tauri/src/lib.rs` (or modules imported there) and must be registered in `generate_handler![]`.
- The Rust lib crate name is `cc_assist_lib` (underscored) to avoid Windows naming conflicts.
- Vite dev server runs on port 1420 with strict port mode; HMR on 1421 when `TAURI_DEV_HOST` is set.
- `src-tauri/` is excluded from Vite file watching to avoid unnecessary reloads during Rust compilation.

## Tauri Permissions

Permissions in `src-tauri/capabilities/default.json` control what the **frontend** can do via Tauri APIs. Rust backend code has unrestricted access to all Tauri APIs — it bypasses the capability system entirely.

**Rule: Never use `default` permissions.** They bundle dozens of permissions and dramatically expand the attack surface.

**Before adding any permission, inspect the frontend code** (`src/`) to find which Tauri APIs are actually called:
- `window.*` → window control (show, hide, focus, etc.)
- `tray.*` → tray icon/menu control
- `event.*` / `listen()` / `emit()` → event system
- `dialog.*` / `fs.*` / `shell.*` → plugin APIs

`invoke()` calls to Rust commands do **not** need individual permissions — only direct Tauri API calls (window, tray, event, etc.) do.

Only grant the specific permissions the frontend actually uses. Example: if the frontend only calls `listen()`, the capability needs only `core:event:allow-listen`, not `core:event:default`.

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Important Rules

- All new code files (ts, tsx, and json) must be formatted with `pnpm oxfmt` and checked with `pnpm oxlint`. All lint errors must be fixed.

## assistant-ui

This project uses assistant-ui for chat interfaces.

Documentation: https://www.assistant-ui.com/llms-full.txt

Key patterns:
- Use AssistantRuntimeProvider at the app root
- Thread component for full chat interface
- AssistantModal for floating chat widget
- useChatRuntime hook with AI SDK transport

## gstack

For all web browsing tasks, use gstack's `/browse` skill. Do not use `mcp__claude-in-chrome__*` tools.

Available gstack skills:

- /office-hours
- /plan-ceo-review
- /plan-eng-review
- /plan-design-review
- /design-consultation
- /design-shotgun
- /design-html
- /review
- /ship
- /land-and-deploy
- /canary
- /benchmark
- /browse
- /connect-chrome
- /qa
- /qa-only
- /design-review
- /setup-browser-cookies
- /setup-deploy
- /retro
- /investigate
- /document-release
- /codex
- /cso
- /autoplan
- /careful
- /freeze
- /guard
- /unfreeze
- /gstack-upgrade
- /learn
