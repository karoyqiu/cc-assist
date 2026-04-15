# cc-assist

A tray-resident profile switcher for Claude Code on Windows. Switch between LLM providers and accounts without modifying `~/.claude/settings.json` manually.

## Features

- **Built-in terminal** — launch and manage multiple Claude Code sessions in tabs, no external terminal needed
- **Tray-based** — lives in the system tray, click to open settings or terminal
- **Multiple providers** — built-in support for Claude Official, z.ai, MiniMax, Kimi, DeepSeek, or add your own custom endpoint
- **Per-profile models** — configure Main, Opus, Sonnet, and Haiku models separately per profile
- **Per-profile proxy** — set HTTPS_PROXY per profile for corporate or regional proxies
- **Font settings** — configurable monospace font family and size, applied live to all terminal sessions
- **One-click launch** — pick a directory and launch Claude Code with the selected profile
- **Persistent settings** — profiles and preferences saved to `%APPDATA%/cc-assist/config.json`
- **Localization** — English and Chinese (Simplified)

## Built-in Providers

| Provider | Base URL |
|----------|----------|
| Claude Official | `https://api.anthropic.com` |
| z.ai International | `https://api.z.ai/api/anthropic` |
| z.ai CN | `https://open.bigmodel.cn/api/anthropic` |
| MiniMax CN | `https://api.minimaxi.com/anthropic` |
| MiniMax International | `https://api.minimax.io/anthropic` |
| Kimi | `https://api.moonshot.cn/anthropic` |
| DeepSeek | `https://api.deepseek.com/anthropic` |

## Build

```bash
pnpm install
pnpm run tauri build
```

The executable will be at `src-tauri/target/release/cc-assist.exe` (or `cc-assist.msi` for the installer).

## How it works

1. Add or select a profile (set API key, base URL, and optionally per-role models)
2. Click **Use** to make it the active profile (writes to `~/.claude/settings.json`)
3. Click **Open Terminal** or use the tray menu to start a Claude Code session

## Data storage

- **Config:** `%APPDATA%/com.gmail.karoyqiu.cc-assist/config.json`
- **Logs:** `%APPDATA%/com.gmail.karoyqiu.cc-assist/app.log`

## Tech stack

Tauri 2.0 + React 19 + TypeScript + Tailwind CSS + shadcn/ui
