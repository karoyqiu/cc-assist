# Design System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark monochrome design with the Claude-inspired warm parchment design system defined in DESIGN.md, and eliminate custom CSS tokens (`--app`, `--surface`, `--subtle`, `--hover`) in favour of shadcn semantic tokens.

**Architecture:** CSS custom properties drive all color and radius tokens. Updating `App.css` cascades through shadcn components automatically. Custom tokens are removed; component files are updated to use equivalent shadcn classes. HTML files keep `class="dark"` — the app remains dark-mode only, using the `.dark` palette from the new warm design system.

**Tech Stack:** Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn (base-mira style, Base UI primitives), CSS custom properties, hex color values.

---

## Token Replacement Map

| Removed token | shadcn replacement | New color |
|---|---|---|
| `bg-app` | `bg-background` | `#f5f4ed` Parchment |
| `bg-surface` | `bg-card` | `#faf9f5` Ivory |
| `bg-subtle` | `bg-muted` | `#e8e6dc` Warm Sand |
| `bg-hover` | `bg-accent` | `#e8e6dc` Warm Sand |
| `border-subtle` | `border-border` | `#f0eee6` Border Cream |
| `text-app` | `text-foreground` | `#141413` Near Black |

---

## File Map

| File | Change |
|------|--------|
| `src/App.css` | New parchment color tokens; remove custom tokens; update radius + scrollbar |
| `src/App.tsx` | `bg-app` → `bg-background`; `border-subtle` → `border-border`; fix `bg-danger` |
| `src/components/Avatar.tsx` | `text-app` → `text-foreground` |
| `src/components/ProfileList.tsx` | `bg-app` → `bg-background`; `bg-surface` → `bg-card`; `bg-subtle` → `bg-muted`; `border-subtle` → `border-border` |
| `src/components/ProfileEditor.tsx` | `bg-app` → `bg-background`; `bg-surface` → `bg-card`; `border-subtle` → `border-border`; `text-app` → `text-foreground` |
| `src/components/TerminalWindow.tsx` | `bg-app` → `bg-background`; `bg-surface` → `bg-card` |
| `src/components/DirectoryCombobox.tsx` | `bg-surface` → `bg-card`; `bg-hover` → `bg-accent`; `border-subtle` → `border-border` |
| `src/components/FontCombobox.tsx` | `bg-surface` → `bg-card`; `bg-hover` → `bg-accent`; `border-subtle` → `border-border` |

**No changes needed** to `src/components/ui/*` — they already use only shadcn semantic classes.

---

## Task 1: Update CSS variables in App.css

**Files:**
- Modify: `src/App.css`

Replace `:root` and `.dark` with the warm parchment palette. Remove custom tokens from `@theme inline`, `:root`, and `.dark`. Update body background and scrollbar references.

- [ ] **Step 1: Replace `@theme inline` block**

Replace the entire `@theme inline { ... }` block (lines 6–53) with:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --font-heading: var(--font-sans);
  --font-sans: system-ui, sans-serif;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
}
```

- [ ] **Step 2: Replace `:root` block**

Replace the entire `:root { ... }` block (lines 56–98) with:

```css
:root {
  --radius: 0.75rem;

  /* Parchment light theme — Claude design system */
  --background: #f5f4ed;
  --foreground: #141413;
  --card: #faf9f5;
  --card-foreground: #141413;
  --popover: #faf9f5;
  --popover-foreground: #141413;
  --primary: #c96442;
  --primary-foreground: #faf9f5;
  --secondary: #e8e6dc;
  --secondary-foreground: #4d4c48;
  --muted: #e8e6dc;
  --muted-foreground: #5e5d59;
  --accent: #e8e6dc;
  --accent-foreground: #4d4c48;
  --destructive: #b53333;
  --destructive-foreground: #faf9f5;
  --border: #f0eee6;
  --input: #e8e6dc;
  --ring: #3898ec;

  color: var(--foreground);
  background-color: var(--background);

  --chart-1: oklch(0.879 0.169 91.605);
  --chart-2: oklch(0.769 0.188 70.08);
  --chart-3: oklch(0.666 0.179 58.318);
  --chart-4: oklch(0.555 0.163 48.998);
  --chart-5: oklch(0.473 0.137 46.201);
  --sidebar: #faf9f5;
  --sidebar-foreground: #141413;
  --sidebar-primary: #c96442;
  --sidebar-primary-foreground: #faf9f5;
  --sidebar-accent: #e8e6dc;
  --sidebar-accent-foreground: #4d4c48;
  --sidebar-border: #f0eee6;
  --sidebar-ring: #3898ec;
}
```

- [ ] **Step 3: Replace `.dark` block**

Replace the entire `.dark { ... }` block (lines 100–132) with:

```css
.dark {
  --background: #141413;
  --foreground: #faf9f5;
  --card: #30302e;
  --card-foreground: #faf9f5;
  --popover: #30302e;
  --popover-foreground: #faf9f5;
  --primary: #c96442;
  --primary-foreground: #faf9f5;
  --secondary: #30302e;
  --secondary-foreground: #b0aea5;
  --muted: #30302e;
  --muted-foreground: #b0aea5;
  --accent: #30302e;
  --accent-foreground: #faf9f5;
  --destructive: #b53333;
  --destructive-foreground: #faf9f5;
  --border: #30302e;
  --input: oklch(1 0 0 / 15%);
  --ring: #3898ec;

  --chart-1: oklch(0.879 0.169 91.605);
  --chart-2: oklch(0.769 0.188 70.08);
  --chart-3: oklch(0.666 0.179 58.318);
  --chart-4: oklch(0.555 0.163 48.998);
  --chart-5: oklch(0.473 0.137 46.201);
  --sidebar: #30302e;
  --sidebar-foreground: #faf9f5;
  --sidebar-primary: #c96442;
  --sidebar-primary-foreground: #faf9f5;
  --sidebar-accent: #30302e;
  --sidebar-accent-foreground: #faf9f5;
  --sidebar-border: #30302e;
  --sidebar-ring: #3898ec;
}
```

- [ ] **Step 4: Update scrollbar rules**

Replace all three scrollbar rules:

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--background);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}
```

- [ ] **Step 5: Run lint + type check**

```bash
cd D:/repos/cc-assist && pnpm oxlint && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "feat(design): replace dark monochrome palette with warm parchment tokens, remove custom CSS vars"
```

---

## Task 2: Replace custom tokens in component files

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Avatar.tsx`
- Modify: `src/components/ProfileList.tsx`
- Modify: `src/components/ProfileEditor.tsx`
- Modify: `src/components/TerminalWindow.tsx`
- Modify: `src/components/DirectoryCombobox.tsx`
- Modify: `src/components/FontCombobox.tsx`

Apply the token replacement map to every component. Also fix the undefined `bg-danger` class in App.tsx.

- [ ] **Step 1: Update App.tsx**

Three replacements:

```tsx
// Line 236 — fix undefined bg-danger:
// FROM:
<div className="text-app bg-danger fixed right-4 bottom-4 z-50 max-w-90 rounded px-4 py-2.5 text-sm font-medium">
// TO:
<div className="bg-destructive text-destructive-foreground fixed right-4 bottom-4 z-50 max-w-90 rounded px-4 py-2.5 text-sm font-medium">

// Line 244 — bg-app:
// FROM:
<div className="bg-app text-muted-foreground flex h-screen w-screen items-center justify-center text-sm">
// TO:
<div className="bg-background text-muted-foreground flex h-screen w-screen items-center justify-center text-sm">

// Line 251 — bg-app:
// FROM:
<div className="bg-app flex h-screen w-screen flex-col overflow-hidden">
// TO:
<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">

// Line 336 — border-subtle:
// FROM:
<div className="border-subtle flex justify-end gap-2 border-t px-5 py-3">
// TO:
<div className="border-border flex justify-end gap-2 border-t px-5 py-3">
```

- [ ] **Step 2: Update Avatar.tsx**

```tsx
// FROM:
className="text-app font-semibold"
// TO:
className="text-foreground font-semibold"
```

- [ ] **Step 3: Update ProfileList.tsx**

```tsx
// Line 65 — bg-surface:
// FROM:
isSelected ? 'bg-surface' : 'hover:bg-surface',
// TO:
isSelected ? 'bg-card' : 'hover:bg-card',

// Line 66 — bg-surface:
// FROM:
isDragging && 'bg-surface opacity-50',
// TO:
isDragging && 'bg-card opacity-50',

// Line 145 — bg-app + border-subtle:
// FROM:
<div className="border-subtle bg-app flex h-full w-60 flex-col border-r">
// TO:
<div className="border-border bg-background flex h-full w-60 flex-col border-r">

// Line 147 — border-subtle:
// FROM:
<div className="border-subtle flex items-center justify-between border-b px-3 pt-4 pb-3">
// TO:
<div className="border-border flex items-center justify-between border-b px-3 pt-4 pb-3">

// Line 192 — bg-subtle (divider):
// FROM:
<div className="bg-subtle my-1 h-px" />
// TO:
<div className="bg-muted my-1 h-px" />

// Line 203 — bg-subtle (avatar placeholder):
// FROM:
<div className="bg-subtle text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm">
// TO:
<div className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm">

// Line 214 — bg-app + border-subtle (empty state panel):
// FROM:
<div className="border-subtle bg-app flex h-full w-60 flex-col border-r">
// TO:
<div className="border-border bg-background flex h-full w-60 flex-col border-r">

// Line 216 — border-subtle:
// FROM:
<div className="border-subtle flex items-center justify-between border-b px-3 pt-4 pb-3">
// TO:
<div className="border-border flex items-center justify-between border-b px-3 pt-4 pb-3">
```

- [ ] **Step 4: Update ProfileEditor.tsx**

```tsx
// Line 116 — bg-app:
// FROM:
<div className="bg-app flex flex-1 flex-col overflow-hidden">
// TO:
<div className="bg-background flex flex-1 flex-col overflow-hidden">

// Line 118 — border-subtle:
// FROM:
<div className="border-subtle flex items-center gap-3 border-b px-5 py-2">
// TO:
<div className="border-border flex items-center gap-3 border-b px-5 py-2">

// Line 231 — border-subtle:
// FROM:
<div className="border-subtle flex justify-end gap-2 border-t px-5 py-3">
// TO:
<div className="border-border flex justify-end gap-2 border-t px-5 py-3">

// Line 257 — bg-surface on AlertDialogContent:
// FROM:
className="border-subtle bg-surface w-95"
// TO:
className="border-border bg-card w-95"

// Line 273 — text-app:
// FROM:
className="text-app"
// TO:
className="text-foreground"
```

- [ ] **Step 5: Update TerminalWindow.tsx**

```tsx
// Line 83–84 — bg-surface (active/hover tab):
// FROM:
? 'border-primary bg-surface border-l-2'
: 'hover:bg-surface border-l-2 border-transparent'
// TO:
? 'border-primary bg-card border-l-2'
: 'hover:bg-card border-l-2 border-transparent'

// Line 407 — bg-app (root container):
// FROM:
<div className="bg-app flex h-screen w-screen overflow-hidden">
// TO:
<div className="bg-background flex h-screen w-screen overflow-hidden">

// Line 505 — bg-app (terminal pane):
// FROM:
className="bg-app relative flex-1 overflow-hidden"
// TO:
className="bg-background relative flex-1 overflow-hidden"
```

- [ ] **Step 6: Update DirectoryCombobox.tsx**

```tsx
// Line 103 — bg-surface + border-subtle (dropdown):
// FROM:
<div className="border-subtle bg-surface absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">
// TO:
<div className="border-border bg-card absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">

// Line 111 — bg-hover (highlighted row):
// FROM:
i === highlightedIndex ? 'bg-hover text-primary' : 'text-muted-foreground'
// TO:
i === highlightedIndex ? 'bg-accent text-primary' : 'text-muted-foreground'

// Line 123 — bg-hover (Browse row):
// FROM:
? 'bg-hover text-primary'
// TO:
? 'bg-accent text-primary'
```

- [ ] **Step 7: Update FontCombobox.tsx**

```tsx
// Line 126 — bg-surface + border-subtle (dropdown):
// FROM:
<div className="border-subtle bg-surface absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">
// TO:
<div className="border-border bg-card absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">

// Line 134 — bg-hover (highlighted row):
// FROM:
i === highlightedIndex ? 'bg-hover text-primary' : 'text-muted-foreground'
// TO:
i === highlightedIndex ? 'bg-accent text-primary' : 'text-muted-foreground'
```

- [ ] **Step 8: Verify no custom tokens remain**

```bash
cd D:/repos/cc-assist && grep -r "bg-app\|bg-surface\|bg-subtle\|bg-hover\|border-subtle\|text-app\|var(--app)\|var(--surface)\|var(--subtle)\|var(--hover)" src/
```

Expected: no matches.

- [ ] **Step 9: Run lint + type check**

```bash
cd D:/repos/cc-assist && pnpm oxlint && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/components/Avatar.tsx src/components/ProfileList.tsx src/components/ProfileEditor.tsx src/components/TerminalWindow.tsx src/components/DirectoryCombobox.tsx src/components/FontCombobox.tsx
git commit -m "refactor(design): replace custom CSS tokens with shadcn semantic classes"
```

---

## Task 3: Visual QA

**No file changes** — verification only.

- [ ] **Step 1: Start dev server**

```bash
cd D:/repos/cc-assist && pnpm run dev
```

- [ ] **Step 2: Verify golden path**

Open http://localhost:1420 and check:
- Background is warm parchment (`#f5f4ed`), not black
- Primary buttons are terracotta (`#c96442`) with ivory text
- Borders are cream-tinted (`#f0eee6`), not bright white or dark
- Text is Near Black (`#141413`), not pure black or gray
- Active tab indicator is terracotta (bottom border)
- Input fields have warm sand background
- No `bg-app` / `bg-surface` / `bg-subtle` / `bg-hover` / `border-subtle` classes remain in DOM

- [ ] **Step 3: Check for visual regressions**

- Profile list: ivory card backgrounds on parchment canvas
- Profile editor: warm sand input backgrounds, cream section borders
- Combobox dropdowns: ivory background, warm sand highlight on hover
- Modal/dialog overlays: black/80 scrim unchanged
- Scrollbars: parchment track, cream thumb, sand on hover

- [ ] **Step 4: Final type check**

```bash
cd D:/repos/cc-assist && pnpm tsc --noEmit
```

Expected: no errors.
