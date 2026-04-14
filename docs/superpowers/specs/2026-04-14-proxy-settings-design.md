# Proxy Settings for Profiles

## Overview

Add HTTP/HTTPS proxy support to profiles. Each profile can optionally specify a proxy URL. When the profile is applied, the proxy URL is injected as `HTTPS_PROXY` into `~/.claude/settings.json` alongside existing env vars.

## Requirements

- HTTP/HTTPS proxy URL field on each profile
- Optional — empty by default, existing behavior unchanged
- Injected via `~/.claude/settings.json` env section (same mechanism as other profile fields)
- Cleared when switching away from a profile with proxy configured

## Data Model

Add `proxy_url` field to `ProfileConfig`:

**TypeScript** (`src/types.ts`):
```typescript
export interface ProfileConfig {
  // ... existing fields
  proxy_url?: string;
}
```

**Rust** (`src-tauri/src/types.rs`):
```rust
pub struct ProfileConfig {
    // ... existing fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
}
```

## Backend Changes

### `src-tauri/src/settings.rs`

1. Add `HTTPS_PROXY` to `build_env_map()` when `proxy_url` is set and non-empty
2. Add `HTTPS_PROXY` to `clear_profile_env_keys()` so it's removed on profile switch
3. No other backend changes needed

## Frontend Changes

### `src/components/ProfileEditor.tsx`

Add proxy URL input field below `base_url` field:
- Label: "Proxy URL"
- Placeholder: "http://proxy:8080"
- Optional field, empty by default
- URL format validation when non-empty (must start with `http://` or `https://`)

## Flow

1. User enters proxy URL in profile editor → saved to `config.json`
2. Profile activated → `apply_profile_to_settings()` writes `HTTPS_PROXY` to `~/.claude/settings.json` env
3. Claude CLI reads settings → uses proxy for API calls
4. Switch to different profile → `HTTPS_PROXY` cleared if new profile has no proxy

## Out of Scope

- SOCKS5 support
- Proxy authentication (username/password)
- Proxy per-model or per-request
- System proxy detection
