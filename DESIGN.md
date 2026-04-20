# Design System — cc-assist

## Product Context
- **What this is:** A tray-resident profile switcher for Claude Code. Stores named profiles (baseUrl, API key, role-specific models), merges the active profile into `~/.claude/settings.json` on launch, and spawns `cmd /c start "" claude` in a user-chosen directory.
- **Who it's for:** Developers who use multiple LLM providers or accounts and need to switch between them quickly.
- **Space/industry:** Developer tooling / CLI utility
- **Project type:** Desktop application (Tauri 2.0, Windows)

## Aesthetic Direction
- **Direction:** Utilitarian Developer Tool — purposeful, precise, no decoration for decoration's sake. Feels like a well-made CLI, not a polished SaaS product.
- **Decoration level:** Minimal — whitespace and typography do the work. Subtle 1px borders. No shadows, no gradients, no rounded card containers.
- **Mood:** Fast, reliable, uncluttered. The UI stays invisible until you need it.
- **Reference:** Terminal meets native macOS app.

## Typography
- **Font:** System default (`system-ui, sans-serif`). No custom font loading.
- **Scale:** Tailwind relative text classes — `text-xs` (labels/muted) / `text-sm` (body/default) / `text-base` (headings).

## Color
- **Approach:** Restrained neutral with per-provider accent. The active profile's accent color is the ONLY color in an otherwise monochrome UI — switching profiles switches the one color on screen.
- **Dark mode:** Default. App is always dark — `.dark` class applied globally. Uses shadcn CSS variable system with oklch notation. Light mode is a secondary consideration.
- **Dark mode shadcn tokens** (`.dark` block):
  - `background/foreground`: oklch(0.145 / 0.985)
  - `primary/primary-foreground`: oklch(0.795 0.184 86.047) / oklch(0.421 0.095 57.708)
  - `secondary/secondary-foreground`: oklch(0.274 0.006 286.033) / oklch(0.985 0 0)
  - `muted/muted-foreground`: oklch(0.269 0 0) / oklch(0.708 0 0)
  - `accent/accent-foreground`: oklch(0.269 0 0) / oklch(0.985 0 0)
  - `destructive/destructive-foreground`: oklch(0.704 0.191 22.216) / oklch(0.985 0 0)
  - `border`: oklch(1 0 0 / 10%), `input`: oklch(1 0 0 / 15%), `ring`: oklch(0.556 0 0)
- **Custom tokens** (app-specific, not shadcn standard): `--app` (#0f0f0f), `--surface` (#1a1a1a), `--subtle` (#2a2a2a), `--hover` (#252525)
- **Provider accents:**
  - Claude Official: `#D4915D` (warm copper)
  - z.ai International / z.ai CN: `#0F62FE` (IBM blue)
  - MiniMax CN / MiniMax International: `#FF6B6B` (coral red)
  - Kimi: `#6366F1` (indigo)
  - DeepSeek: `#1E88E5` (blue)

## Spacing
- **Base unit:** 4px
- **Density:** Compact — this is a utility, not a marketing page.
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(20) 2xl(24) 3xl(32)

## Layout
- **Approach:** Two-panel — left panel (profile list, 240px fixed), right panel (editor, fills remaining space). Clean vertical split.
- **Window:** 700x500, resizable, centered on open, min-width prevents panel collapse.
- **Directory picker:** Modal overlay (centered, 512px / w-128 wide).
- **Border radius:** shadcn scale (base 0.625rem ≈ 10px). Compact feel preserved via tight padding, not small radius.

## Motion
- **Approach:** Minimal-functional only. Uses `tw-animate-css` for shadcn component animations (fadeIn, etc.). No choreography, no spring animations — this is a config tool, not a consumer app.
- **Easing:** ease-out for enters. No exit animations needed.

## Component Inventory

### Profile List (left panel)
- Fixed `w-60` (240px) width, full height, border-right divider
- Header: "Profiles" label + "+" add button (shadcn `size="icon"`)
- Items: avatar circle (provider color, 28px) + name + checkmark (visible only on active), `py-6` vertical padding
- Provider picker: left-aligned (`justify-start`), `py-5`/`py-6` per item
- Hover state: background shifts to surface color
- Active item: surface background + checkmark visible

### Profile Editor (right panel)
- Header: large avatar (40px, provider color) + profile name + preset badge (built-in) + duplicate/delete actions (shadcn `default` button size)
- Fields: API Key (password, monospace), Base URL (read-only for built-in, monospace), model fields in 2-column grid (Main/Opus, Sonnet/Haiku)
- Actions: "Launch Claude" (primary accent) + "Save Changes" (secondary) — shadcn `default` button size, no explicit overrides

### Directory Picker Modal
- Centered overlay with dark scrim
- Recent directories (up to 10, monospace font, most recent first)
- "Browse..." button opens native OS directory picker via rfd
- Cancel / Launch buttons

### Tray Menu
- Flat list (no submenus)
- Profile items: avatar dot + name + checkmark on active
- Launch Claude, Settings, separator, English / Chinese (radio-style), separator, Quit

### Avatar
- 28px (profile list) / 40px (editor header) — both are 28px avatar in tray menu
- Provider color background, first letter of provider name as content
- Border-radius: 50% (perfect circle)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-09 | Initial design system created | Created by /design-consultation |
| 2026-04-09 | Fonts: Noto Sans + Noto Sans Mono | User preference — already in project deps as @fontsource-variable/noto-sans |
| 2026-04-09 | Active profile = only colored element in UI | Color-as-identity approach makes switching profile visually unmistakable |
| 2026-04-11 | Removed custom font, use system default | Cleaner, no font loading overhead |
| 2026-04-11 | Removed explicit button sizing, use shadcn defaults | Buttons inherit size from component variants |
| 2026-04-11 | All pixel sizes → Tailwind canonical classes | Consistency, smaller output, design alignment |
| 2026-04-11 | Provider picker: left-aligned buttons, taller touch targets | Better usability and alignment with design |
| 2026-04-11 | Directory picker: 500px → w-128 (512px) | Use Tailwind width scale for layout values |
| 2026-04-20 | Migrate radix-ui → base-ui | shadcn base-mira style uses base-ui primitives; radix-ui removed |
| 2026-04-20 | Color: hex → oklch notation | shadcn standard; dark mode via `.dark` class |
| 2026-04-20 | tw-animate-css for animations | Required by shadcn base-mira components |
| 2026-04-20 | System default font, no fontsource | Simpler, no loading overhead |
| 2026-04-20 | Full oklch color palette documented | DESIGN.md reflects exact current values |
