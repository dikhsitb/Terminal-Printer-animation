# Terminal Printer Animation

An interactive, animated **thermal-printer receipt** built with React. Drag the
**"Slide to print"** control and watch a printer spring into view, feed out a
fully-rendered restaurant bill with sound, and finish with a payment-success
message.

![Receipt printing animation](src/assets/printer.png)

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| UI library | [**React 18**](https://react.dev) | Functional components + hooks (`useState`, `useRef`, `useLayoutEffect`, `useCallback`) |
| Language | [**TypeScript 5**](https://www.typescriptlang.org) | Fully typed component + props |
| Build tool | [**Vite 5**](https://vitejs.dev) | Dev server with HMR, production bundling (`@vitejs/plugin-react`) |
| Styling | [**Tailwind CSS 3**](https://tailwindcss.com) + inline styles | Tailwind base/reset via `src/index.css`; pixel-accurate layout via inline styles ported from Figma |
| Declarative animation | [**Framer Motion 11**](https://www.framer.com/motion/) | Printer entrance, phase transitions, content shifts |
| Imperative animation | [**GSAP 3**](https://gsap.com) | Frame-accurate receipt feed-out and reveal |
| Audio | Native `HTMLAudioElement` | Preloaded MP3 print sound with a volume fade-out |
| Tooling | PostCSS, Autoprefixer | CSS processing pipeline for Tailwind |

**Fonts:** [Satoshi](https://www.fontshare.com/fonts/satoshi) (receipt) and
[Inter](https://fonts.google.com/specimen/Inter) (UI), loaded via CDN in
`index.html`.

---

## How the animation works

The whole experience is a small **state machine** with three phases, driven from
`src/PrinterAnimation.tsx`:

```ts
type Phase = 'idle' | 'printing' | 'done'
```

### 1. Framer Motion — declarative entrance & transitions

- **Printer entrance:** the printer body (an inline SVG) animates in with a
  spring (`initial → animate`, `type: 'spring'`) so it "pops" onto the screen
  before anything else.
- **Phase content:** an `<AnimatePresence mode="wait">` swaps the idle slide
  button, the (empty) printing state, and the done message with fade/slide
  transitions.
- **Layout shift:** the content area below the printer animates its `marginTop`
  so it slides down to make room as the receipt emerges (its own `contentShift`
  duration, kept independent of the print speed).

### 2. GSAP — imperative receipt motion

GSAP controls the receipt because it needs frame-accurate, eased translation:

- On mount (`useLayoutEffect`), the receipt is tucked **inside** the printer
  (`gsap.set` to a negative `translateY`) and hidden, then revealed **after** the
  printer has entered — so the printer always loads before the bill (no flash).
- On print, a `gsap.timeline()` feeds the receipt out
  (`y: INIT → 0`, `power2.out`) over ~3.5s, then flips the phase to `done`.

The receipt's height drives the animation: `R_INNER_H` (the native canvas
height) is scaled by `R_SCALE`, and `R_H` / `RECEIPT_INIT_Y` / the done-phase
offset are all **derived** from it, so changing the bill's content automatically
keeps the print travel and layout correct. The background SVG uses
`preserveAspectRatio="none"` so it stretches to any content height.

### 3. Slide-to-print interaction

A custom pointer-driven control (`SlideButton`): the handle grows wider as you
drag right (`pointerdown` / `pointermove` / `pointerup`), revealing chevrons, and
fires the print once it passes a drag threshold.

### 4. Sound

A single `HTMLAudioElement` is **preloaded at module load** (so the first print
has no fetch/decode lag) and reused on every print. Playback starts slightly
before the paper feed, plays at a reduced volume, and is faded to zero with a
`requestAnimationFrame` ramp (guarded by a token to cancel stale fades on rapid
replays) as the printer comes to a stop.

---

## How the Figma MCP was used

The entire UI was built **design-to-code from Figma** using the
[Figma MCP server](https://www.figma.com/blog/introducing-figmas-dev-mode-mcp-server/),
which lets the AI coding agent read a Figma file directly instead of eyeballing a
screenshot. The workflow was:

1. **Pull design context** — `get_design_context` / `get_metadata` were called on
   specific Figma node IDs to retrieve exact geometry (positions, sizes, corner
   radii), fills/gradients, typography, and reference markup for each element.
2. **Pull screenshots** — `get_screenshot` gave a visual reference of each frame
   and slider state to verify the implementation against the source design.
3. **Port to pixel-accurate inline styles** — the returned values were translated
   into the inline-styled React components in `src/PrinterAnimation.tsx`, keeping
   the layout faithful to the original frame rather than approximating it.

You can see the fingerprints of this throughout the code as comments that cite the
**source Figma node IDs and coordinates**:

```ts
// ─── Dimensions (derived from Figma @ 460px printer width) ─
// Receipt (Figma: 742px wide at left=88, top=202 in printer frame)
//   width=112 → 3 icons visible  (Figma 298015)
//   width=231 → 6 icons visible  (Figma 298115)
//   width=322 → 8 icons visible  (Figma 298191 / 297207)
```

- The **printer body** is the Figma artwork exported as an inline SVG, rendered in
  a `915 × 273` viewBox and scaled to a `460px` width.
- The **receipt** is drawn on Figma's native `741 × 1290` canvas and uniformly
  scaled (`R_SCALE`) so every coordinate maps 1:1 to the design.
- The **slide-to-print handle** reproduces multiple Figma states (resting →
  partially dragged → fully slid), each captured from a distinct node ID
  (`298015`, `298115`, `298191`, `297207`) so the chevron reveal matches the
  design at every width.

This is why dimensions are written as explicit ratios of the Figma values
(e.g. `Math.round(202 * 460 / 915)`) instead of magic numbers — they are derived
directly from the design coordinates the MCP returned.

---

## Animation frameworks

Two complementary libraries are used, each for what it does best:

| Framework | Role | Used for |
|---|---|---|
| [**Framer Motion 11**](https://www.framer.com/motion/) | Declarative, React-native animation | Printer **spring entrance** (`type: 'spring'`, `stiffness: 200`, `damping: 22`), phase transitions via `AnimatePresence`, and the content-area `marginTop` layout shift |
| [**GSAP 3**](https://gsap.com) | Imperative, timeline-based animation | Frame-accurate **receipt feed-out** (`gsap.timeline()`, `y: INIT → 0`, `power2.out`) and the initial tuck/reveal (`gsap.set`) so the bill is hidden inside the printer until it prints |

Pointer interaction (the slider) is handled with **native Pointer Events**, and
the print **sound** uses the native **`HTMLAudioElement`** — no extra animation or
audio dependencies beyond the two above.

---

## Credits

- **Buttons, hover animations, and the dot-mesh background** are based on
  components from [**Pixel Perfect UI**](https://www.pixel-perfect.space/) — a
  lightweight React component library for modern web apps (React, Next.js,
  Tailwind CSS, Framer Motion, GSAP).

---

## Project structure

```
src/
├─ main.tsx               # React entry point
├─ PrinterAnimation.tsx   # The entire animation (printer, receipt, slider, sound)
├─ index.css              # Tailwind directives + base reset
└─ assets/                # Printer & receipt SVGs, print-sound.mp3
index.html                # HTML shell + font links
vite.config.ts            # Vite config
tailwind.config.js        # Tailwind config
```

---

## Getting started

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. Build for production
npm run build

# 4. Preview the production build
npm run preview
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with hot-module reload |
| `npm run build` | Type-check (`tsc`) and bundle for production |
| `npm run preview` | Serve the production build locally |
