# cc-assist

A tray-resident profile switcher for Claude Code on Windows. Switch between LLM providers and accounts without modifying `~/.claude/settings.json` manually.

## Features

- **Tray-based** — lives in the system tray, click to open settings
- **Multiple providers** — built-in support for Claude Official, z.ai, MiniMax, Kimi, DeepSeek, or add your own custom endpoint
- **Per-profile models** — configure Main, Opus, Sonnet, and Haiku models separately per profile
- **One-click launch** — pick a directory and launch Claude Code with the selected profile
- **Persistent settings** — profiles and preferences saved to `%APPDATA%/cc-assist/config.json`
- **Localization** — English and Chinese (Simplified)
- **Single instance** — launching a second instance brings the existing window to focus

## Built-in Providers

| Provider | Base URL |
|----------|----------|
| Claude Official | `https://api.anthropic.com` |
| z.ai International | `https://api.z.ai` |
| z.ai CN | `https://api.z.ai.cn` |
| MiniMax CN | `https://api.minimax.chat` |
| MiniMax International | `https://api.minimaxi.com` |
| Kimi | `https://api.moonshot.cn` |
| DeepSeek | `https://api.deepseek.com` |

## Build

```bash
pnpm install
pnpm run tauri build
```

The executable will be at `src-tauri/target/release/cc-assist.exe` (or `cc-assist.msi` for the installer).

## How it works

1. Add or select a profile (set API key, base URL, and optionally per-role models)
2. Click **Use** to make it the active profile (writes to `~/.claude/settings.json`)
3. Click **Launch Claude** to open a terminal session with that profile already active

## Data storage

- **Config:** `%APPDATA%/com.gmail.karoyqiu.cc-assist/config.json`
- **Logs:** `%APPDATA%/com.gmail.karoyqiu.cc-assist/app.log`

## Tech stack

Tauri 2.0 + React 19 + TypeScript + Tailwind CSS + shadcn/ui
