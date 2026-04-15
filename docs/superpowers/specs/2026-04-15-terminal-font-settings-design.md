# Terminal Font Settings

## Summary

Add font family and font size settings for the terminal window. Persisted in config, configurable via settings window (Terminal tab), applied live to xterm instances. Font selection uses system fonts via `tauri-plugin-system-fonts`, filtered to monospace only, with combobox UI.

## Data Layer

- Add to `ProfilesStore` in `src-tauri/src/types.rs`:
  - `terminal_font_family: String` — default `"Cascadia Code, Fira Code, Consolas, monospace"`
  - `terminal_font_size: u16` — default `14` (px, same as xterm.js `fontSize`)
- Both use `#[serde(default)]` for backward compatibility with existing configs.
- New Tauri command `save_terminal_font_settings(font_family: String, font_size: u16)`:
  - Updates store, persists to config.json
  - Emits `terminal-font-changed` event with `{ font_family, font_size }`

## System Fonts

- Use `tauri-plugin-system-fonts` (Rust) + `tauri-plugin-system-fonts-api` (JS).
- `getSystemFonts()` returns `string[]` of all system font family names.
- Plugin does not expose monospace metadata — filter client-side.
- **Monospace detection**: use browser canvas `measureText()` trick — measure width of `"mmmmmmmmll"` vs `"mmmmmmmmmm"`. If equal → monospace.
- Filter applied once on settings window mount, cached for session.

## Settings Window UI

- Tab bar at top of settings window: "Profiles" | "Terminal"
- "Profiles" tab = current profile list + editor (unchanged)
- "Terminal" tab:
  - Font family: combobox listing monospace system fonts, with free-text input (CSS font-family syntax allowed). Filter dropdown by typed input. Show "monospace" as always-available fallback.
  - Font size: number input (range 8–72, unit: px)
  - Auto-save on change (debounced input)

## Terminal Window

- On mount: load font settings from `get_config` response, call `setFontSettings()`
- Listen for `terminal-font-changed` event
- On change: update `fontSettings` in `terminal.ts` + apply to all active xterm instances via `term.options.fontFamily` / `term.options.fontSize`
- Existing terminals update live, no restart needed

## Files Changed

1. `src-tauri/Cargo.toml` — add `tauri-plugin-system-fonts` dependency
2. `src-tauri/src/types.rs` — add `terminal_font_family`, `terminal_font_size` to `ProfilesStore`
3. `src-tauri/src/config.rs` — add default values for new fields
4. `src-tauri/src/commands.rs` — add `save_terminal_font_settings` command
5. `src-tauri/src/lib.rs` — register new command + system-fonts plugin in `generate_handler![]`
6. `src-tauri/capabilities/default.json` — add `system-fonts:default` permission
7. `package.json` — add `tauri-plugin-system-fonts-api` dependency
8. `src/types.ts` — add fields to `ProfilesStore` interface
9. `src/App.tsx` — add tab state + tab bar + Terminal tab with font combobox + size input
10. `src/lib/terminal.ts` — add `applyFontToAllTerminals()` to update live terminals
11. `src/components/TerminalWindow.tsx` — load font on mount + listen for `terminal-font-changed` + apply live
