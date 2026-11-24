# siq — Session Handoff & Remaining UI Tasks

> **For the next agent session (Home PC):** Read this file completely, respond to the user in **Persian**, and continue cleanly from the remaining tasks below. After finishing all remaining tasks, you may delete this `HANDOFF.md` file (or keep it updated if the user asks).

---

## 1. Environment & Project Facts
- **Stack:** Next.js 15.5 (App Router, Turbopack), React 19, Tailwind CSS v4, Motion (`motion/react`), Drizzle ORM + PostgreSQL, LiveKit (`livekit-client`), `sileo`, `shiki`.
- **Local Dev Port:** `3100` (`pnpm dev` → `http://localhost:3100`).
- **Design System ("Obsidian Acoustic Studio"):**
  - Deep obsidian surfaces (`#070709`, `#0B0C0F`, `#0E0F12`, `#121316`, `#16171D`), crisp `white/[0.07–0.12]` hairlines, `.siq-bezel` / `.siq-bezel-sm` subtle top-lit bezels.
  - **Strict Anti-AI-Slop rules:** NO generic purple/violet AI gradients, NO neon glowing blobs, NO lazy `backdrop-blur` on every container, NO muddy drop shadows.
- **Typography (100% Local Self-Hosted in `src/app/fonts/`):**
  - **Persian font:** Always **`Milad`** (`Milad-Thin.woff2` … `Milad-ExtraBlack.woff2`), scoped with `unicode-range` in `src/app/layout.tsx` and placed first in every `--siq-font-sans` stack in `src/app/globals.css`. Keep the name strictly **`Milad`** everywhere.
  - **English font presets (4 options in Settings → Appearance):** `Geist × Milad`, `IBM Plex × Milad`, `Manrope × Milad`, `Rubik × Milad`, plus `GeistMono` for monospace.
- **Themes:** 8 curated dark themes (`emerald`, `cyan`, `cobalt`, `indigo`, `violet`, `coral`, `amber`, `silver`) + `customAccentHex` infrastructure already wired in `src/lib/preferences.ts` and `src/app/layout.tsx`.

---

## 2. Already Completed & Committed (`dacad20`)
1. **Milad Persian Font:** 8 WOFF2 weights self-hosted and applied globally to all Persian text across all 4 presets.
2. **Unified Categorized Smart Search (`Ctrl+K` / `⌘K`):**
   - Single Smart Search bar in all 3 headers (`WorkspaceShell.tsx`), duplicate header search removed from `ChannelHeaderTools.tsx` (Pin only).
   - 6 categorized tabs (`All`, `Messages`, `Channels`, `People`, `Servers`, `Settings & Actions`) + live debounced message search + EN/FA bilingual keywords in `src/components/dm/FindConversationModal.tsx`.
3. **Discord-Style Server Folders:**
   - Collapsed 2×2 mini-icon grid ↔ expanded vertical capsule pill, 3-zone drag-and-drop merge/reorder, right-click Folder Settings (rename, 8 colors, ungroup) in `src/lib/server-folders.ts` and `src/components/workspace/ServerRail.tsx`.
4. **Notification Toasts + Sileo Liquid:**
   - Fixed stuck-toast timer reset bug with ref-stabilized callbacks + 60fps RAF pause-on-hover / resume-on-unhover in `src/components/ui/NotificationCenter.tsx`.
   - Integrated **Sileo** (`sileo` package) as default `"liquid"` toast style + **Toast Animation Style** toggle (`Sileo Liquid` / `Obsidian Stack`) & **`Test Stack`** button in **Settings → Notifications** (`src/components/workspace/SettingsModal.tsx`).
5. **Animated Icons (`lucide-animated`):**
   - 26 animated icon components downloaded to `src/components/ui/animated-icons/` + hover helper `src/components/ui/AnimatedIcon.tsx`.
   - Already wired into `NotificationBell`, Smart Search bar, Settings button, DM Voice Call, Voice Mic/Mute/Disconnect, Friends nav, and Direct Messages `+`.

---

## 3. Remaining Tasks (User Approved — Ready to Implement)

### Task A: Pro Color Picker (Kibo UI–style, Figma-like)
- **Reference:** https://www.kibo-ui.com/components/color-picker
- **Build:** `src/components/ui/ColorPicker.tsx`
  - Interactive 2D Saturation/Lightness area (pointer drag + keyboard accessible)
  - Hue spectrum slider
  - Native browser `EyeDropper` button (feature-detected, gracefully hidden if unsupported)
  - Editable `HEX` input + `RGB` / `HSL` display/format toggle + quick studio preset swatches
  - Compact popover or inline variant matching Obsidian Studio tokens
- **Wire into 3 places:**
  1. **Server Folder Settings** (`src/components/workspace/ServerRail.tsx`) — pick any custom folder color beyond the 8 swatches.
  2. **Server Roles & Server Accent** (`src/components/workspace/ServerSettingsModal.tsx`) — pick any custom role color (`roleColor`) and server accent color (`srvColor`).
  3. **Settings → Appearance** (`src/components/workspace/SettingsModal.tsx`) — custom accent color picker wired to `appPrefs.customAccentHex` (already supported by `applyAppearancePreferences` in `src/lib/preferences.ts` and bootstrap script in `src/app/layout.tsx`!), with a clear "Reset to preset" button when a custom hex is active.

### Task B: Chat Code Blocks with Syntax Highlighting (Kibo UI–style)
- **Reference:** https://www.kibo-ui.com/components/code-block
- **Package:** `shiki` (`4.6.0`) is **already installed** in `package.json`.
- **Build:** `src/components/chat/ChatCodeBlock.tsx`
  - Async client-side `shiki` highlighting (`codeToHtml` with a crisp dark theme like `github-dark-default` or `vesper`, falling back cleanly to plain monospace while loading or for unknown languages).
  - Supports language label and optional filename (` ```ts:src/app.ts `).
  - Clean header bar with language/filename pill + animated `CopyIcon` → `CheckIcon` copy button + optional line numbers.
- **Wire into:** `src/components/chat/TextChannelView.tsx` (which also renders DM messages via `DmConversationView.tsx`):
  - Parse fenced code blocks (` ```lang\n...\n``` `) and inline code (`` `code` ``) while preserving `renderLinkifiedText` for normal prose and RTL `dir="auto"` behavior.

### Task C: Audio Waveform Player & Live Mic Waveform (ElevenLabs UI–style)
- **References:**
  - https://ui.elevenlabs.io/docs/components/audio-player
  - https://ui.elevenlabs.io/docs/components/waveform
- **Build:** `src/components/chat/AudioWaveformPlayer.tsx`
  - Canvas-based audio waveform player for `audio/*` attachments (`.mp3`, `.wav`, `.ogg`, `.webm`, `.m4a`).
  - Decodes real audio peaks via Web Audio API (`AudioContext.decodeAudioData`) with a deterministic visual waveform fallback if decoding fails.
  - Interactive click/drag scrubbing on the waveform canvas, animated `PlayIcon` / `PauseIcon`, `tabular-nums` elapsed/total duration, playback speed toggle (`1x`, `1.25x`, `1.5x`, `2x`, `0.75x`), and download button.
- **Wire into:**
  1. `src/components/chat/TextChannelView.tsx` — render `<AudioWaveformPlayer />` for `att.contentType.startsWith("audio/")` attachments instead of the generic file card.
  2. **Settings → Voice** (`src/components/workspace/SettingsModal.tsx`) — add a compact **Live Mic Waveform** tester (using Web Audio `AnalyserNode` on a canvas) so users can visually test their microphone & noise cancellation live.

### Task D: Finish Wiring Remaining Animated Icons (`lucide-animated`)
- **Reference:** https://lucide-animated.com/ (icons already exist in `src/components/ui/animated-icons/`)
- Wire into:
  - `src/components/chat/TextChannelView.tsx`: `SendIcon`, `AttachFileIcon`, `DownloadIcon`, `CopyIcon` / `CheckIcon`
  - `src/components/workspace/ServerRail.tsx`: `PlusIcon` (Add/Join Server), `FolderOpenIcon` (expanded folder header)

---

## 4. Verification Checklist After Finishing
1. Run `pnpm typecheck` (`tsc --noEmit`) — must pass with 0 errors.
2. Run clean `pnpm build` (remove `.next` first if Turbopack dev cache was active) — must pass with 0 errors.
3. Verify `pnpm dev` runs cleanly on `http://localhost:3100`.
