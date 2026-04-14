# Proxy Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional HTTP/HTTPS proxy URL field to profiles, injected as `HTTPS_PROXY` env var in `~/.claude/settings.json`.

**Architecture:** Extend `ProfileConfig` with `proxy_url` field. Backend adds it to the env map built by `build_env_map()` and the managed keys list. Frontend adds an input field in the profile editor.

**Tech Stack:** Rust (serde), TypeScript/React, Tauri invoke

---

### Task 1: Add `proxy_url` to Rust types

**Files:**
- Modify: `src-tauri/src/types.rs:40-55`

- [ ] **Step 1: Add `proxy_url` field to `ProfileConfig`**

In `src-tauri/src/types.rs`, add after the `provider_id` field (line 54):

```rust
    /// → HTTPS_PROXY
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
```

- [ ] **Step 2: Run type check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: Compilation errors in `settings.rs` tests where `ProfileConfig` structs are constructed (missing `proxy_url` field). This confirms the field is added correctly.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/types.rs
git commit -m "feat(proxy): add proxy_url field to ProfileConfig"
```

---

### Task 2: Update `settings.rs` to handle `HTTPS_PROXY`

**Files:**
- Modify: `src-tauri/src/settings.rs:41-70` (build_env_map)
- Modify: `src-tauri/src/settings.rs:75-82` (MANAGED_ENV_KEYS)
- Modify: `src-tauri/src/settings.rs:142-389` (tests)

- [ ] **Step 1: Add `HTTPS_PROXY` to `build_env_map`**

In `src-tauri/src/settings.rs`, add after the opus model block (after line 68), before the closing `map`:

```rust
    if let Some(ref proxy) = profile.proxy_url {
        if !proxy.is_empty() {
            map.insert("HTTPS_PROXY".to_string(), proxy.clone());
        }
    }
```

- [ ] **Step 2: Add `HTTPS_PROXY` to `MANAGED_ENV_KEYS`**

In `src-tauri/src/settings.rs`, add to the `MANAGED_ENV_KEYS` array (line 75-82):

```rust
const MANAGED_ENV_KEYS: &[&str] = &[
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "HTTPS_PROXY",
];
```

- [ ] **Step 3: Fix existing tests — add `proxy_url: None` to all `ProfileConfig` instances**

Every `ProfileConfig { ... }` in the test module needs `proxy_url: None` added. There are instances at approximately these lines:
- ~157 (`test_build_env_map_all_empty`)
- ~169 (`test_build_env_map_base_url_only`)
- ~192 (`test_build_env_map_all_fields`)
- ~211 (`test_build_env_map_api_key_empty`)
- ~241 (`test_merge_profile_partial`)
- ~275 (`test_merge_profile_preserves_non_env_keys`)
- ~328 (`test_apply_profile_clears_previous_profile_keys`)

Add `proxy_url: None,` before the closing `}` of each struct literal.

- [ ] **Step 4: Add test for `proxy_url` in `build_env_map`**

Add this test in the `mod tests` block:

```rust
    #[test]
    fn test_build_env_map_with_proxy() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: Some("http://proxy:8080".into()),
        };
        let map = build_env_map(&profile);
        assert_eq!(map.get("HTTPS_PROXY").unwrap(), "http://proxy:8080");
    }

    #[test]
    fn test_build_env_map_proxy_empty_string() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: Some("".into()),
        };
        let map = build_env_map(&profile);
        assert!(!map.contains_key("HTTPS_PROXY"));
    }

    #[test]
    fn test_build_env_map_proxy_none() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        assert!(!map.contains_key("HTTPS_PROXY"));
    }
```

- [ ] **Step 5: Add test for `clear_profile_env_keys` removing `HTTPS_PROXY`**

```rust
    #[test]
    fn test_clear_removes_https_proxy() {
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {
                "HTTPS_PROXY": "http://proxy:8080",
                "ANTHROPIC_TEMPERATURE": "0.5"
            }
        }"#).unwrap();

        clear_profile_env_keys(&mut settings);

        let env = settings.get("env").unwrap().as_object().unwrap();
        assert!(!env.contains_key("HTTPS_PROXY"));
        assert_eq!(env.get("ANTHROPIC_TEMPERATURE").unwrap(), "0.5");
    }
```

- [ ] **Step 6: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(proxy): inject HTTPS_PROXY into settings.json env"
```

---

### Task 3: Add `proxy_url` to TypeScript types

**Files:**
- Modify: `src/types.ts:18-28`

- [ ] **Step 1: Add `proxy_url` field to `ProfileConfig`**

In `src/types.ts`, add after `provider_id` (line 27):

```typescript
  /** → HTTPS_PROXY */
  proxy_url?: string;
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(proxy): add proxy_url to TS ProfileConfig type"
```

---

### Task 4: Add proxy URL field to profile editor UI

**Files:**
- Modify: `src/components/ProfileEditor.tsx:158-178` (fields section)
- Modify: `src/locales/en.json` (add translation key)
- Modify: `src/locales/zh.json` (add translation key)

- [ ] **Step 1: Add i18n key to `en.json`**

In `src/locales/en.json`, add inside `profileEditor` object:

```json
    "proxyUrl": "Proxy URL",
```

- [ ] **Step 2: Add i18n key to `zh.json`**

In `src/locales/zh.json`, add inside `profileEditor` object:

```json
    "proxyUrl": "代理 URL",
```

- [ ] **Step 3: Add proxy URL field to `ProfileEditor.tsx`**

In `src/components/ProfileEditor.tsx`, add after the Base URL `<Field>` block (after line 177), before the Models section:

```tsx
        {/* Proxy URL */}
        <Field
          label={t('profileEditor.proxyUrl')}
          value={draft.proxy_url ?? ''}
          onChange={official ? undefined : (v) => update('proxy_url', v)}
          readOnly={official}
          mono
          placeholder="http://proxy:8080"
        />
```

- [ ] **Step 4: Run lint + type check**

Run: `pnpm oxlint && pnpm tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfileEditor.tsx src/locales/en.json src/locales/zh.json
git commit -m "feat(proxy): add proxy URL field to profile editor"
```

---

### Task 5: Run full build verification

**Files:** None (verification only)

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: All tests pass.

- [ ] **Step 2: Run Rust lint**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml`

Expected: No warnings.

- [ ] **Step 3: Run frontend type check**

Run: `pnpm tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Run frontend lint**

Run: `pnpm oxlint`

Expected: No errors.

- [ ] **Step 5: Commit (if any fixes needed)**

Only if fixes were needed.
