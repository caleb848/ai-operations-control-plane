# Design system (v3)

The interface explains one thing: **where an AI request should run, and why.** Every request ends at one of four destinations (Local AI, Cloud AI, Human review, Blocked). v3 keeps that semantic core and gives it a bolder voice: an aurora backdrop over a soft light canvas (or a deep-space dark one), a violet "control plane" brand, glowing destination accents, bento layouts and data visualizations with presence.

Tokens live in `src/app/globals.css`; shared components in `src/components/ui`, `src/components/charts` and the feature folders.

## Principles

1. **Decision first.** Each page answers a question in its headline ("Where should this AI request run?"), with the key words in the brand color. Detail sits one click deeper, in disclosures.
2. **Color means destination; violet means the product.** The four destination hues carry meaning. Violet is brand chrome (logo, primary actions, highlights, the routing core) and never encodes data. Red (`danger`) means a real failure, never a policy block.
3. **Glow, don't brighten.** Data marks keep the validated fills. Vibrancy comes from halos, fill-to-ink gradients and light pulses, so charts stay color-blind safe.
4. **Never color alone.** Every destination shows an icon and a label; every classification an icon, a label and sensitivity pips.
5. **Truthful by construction.** On the public deployment, routing, governance and cost logic run for real and model execution is simulated. The top bar's Portfolio Mode pill (a banner on smaller screens) says so on every page. Copy never implies the hosted site runs Gemma, Qwen or Claude.
6. **Motion explains.** Requests travel the routing map, the chosen route draws in and keeps pulsing, the destination lands. Ambient motion (the aurora) is slow and quiet. Everything stops under `prefers-reduced-motion`.

## Color

Light is the default theme. The theme toggle (or ⌘K) switches to dark, and the choice is remembered on that device.

| Token | Role | Dark | Light |
| --- | --- | --- | --- |
| `--bg` | Canvas | `#07080d` | `#f4f4fa` |
| `--surface` / `-2` / `-3` | Cards / insets / hover | `#0f1018` / `#151622` / `#1c1d2b` | `#ffffff` / `#f3f3f9` / `#eaeaf4` |
| `--line` / `--line-strong` | Dividers / control borders | `#20212f` / `#2e3044` | `#e6e6f0` / `#d4d4e3` |
| `--fg` / `-2` / `-3` | Text | `#f4f5fa` / `#c0c3d2` / `#9497aa` | `#0d0e15` / `#3b3d4c` / `#5c5f70` |
| `--fg-4` | Decorative only | `#63667a` | `#9a9cad` |
| `--brand` | Violet brand | `#6a4cff` | `#5b46f5` |
| `--brand-ink` | Brand-colored text | `#b3a9ff` | `#4a3ae8` |
| `--brand-gradient` | Primary actions, active navigation | `#5b46f5` → `#7357ff` | same |

White text on the brand gradient is at least 4.6:1. Brand ink is 9:1 on dark cards and 6.3:1 on the light canvas.

### Destinations

| Destination | Meaning | Fill (dark / light) | Ink (dark / light) | Icon |
| --- | --- | --- | --- | --- |
| `local` | Private, on-device | `#009267` / `#008065` | `#64d6af` / `#006c52` | `Laptop` |
| `cloud` | Capable, approved providers | `#3690e3` | `#80bfff` / `#2460b7` | `Cloud` |
| `review` | A person approves the output | `#be8700` | `#f5c25f` / `#985c00` | `UserRoundCheck` |
| `blocked` | Policy enforced, nothing sent | `#d9668e` / `#c0558d` | `#f6a0c1` / `#9f366c` | `ShieldBan` |

Each hue also has `-soft` (tint) and `-line` (border) mixes. The fills pass the dataviz palette validator in both themes: lightness band, chroma floor, contrast, and color-vision-deficiency separation across all pairs (the closest pair is legal only with secondary encoding, which is why icons and labels are mandatory). Brighter "luminous" fills were tested and rejected because they leave the lightness band.

Classification (Public, Internal, Confidential, Restricted) is deliberately **not** colored. It uses neutral ink, an icon (`Globe`, `Building2`, `Lock`, `LockKeyhole`) and one to four sensitivity pips.

## Surfaces and effects

| Class | What it does |
| --- | --- |
| `.backdrop` | Fixed aurora behind every page: violet, rose and teal fields drifting on 28s and 34s loops, over a dot grid that fades out from the top. Static under reduced motion. |
| `.card` | 24px corners, hairline border, a faint top sheen and one soft shadow. |
| `.card-glow` | A luminous gradient border and outer glow in `--glow` (brand by default; destination hues on destination content). |
| `.hero-surface` | The violet hero: deep gradient, lit corner and dot texture. Text on it is white or `#f1eeff` (5:1 or better where text sits). |
| `.icon-tile` | An icon in a tinted, glowing tile; `--tone` and `--tone-ink` set the hue. |
| `.btn-brand` | The lit violet pill for the one primary action per view. |
| `.spotlight` | A cursor-following highlight on interactive cards, shown on hover. The shell feeds it the pointer position. |
| `.text-gradient`, `.text-brand` | Gradient type for hero figures and headline accents. |
| `.glass-bar` | Blurred, translucent sticky chrome (top bar, mobile bars). |
| `.enter` | Staggered entrance for page sections; `--i` sets the order. |

All of these live in `@layer components`, so utility classes still override them.

## Typography

**Space Grotesk** for display (headlines, hero figures, card titles), **Geist** for interface text, **Geist Mono** for IDs and model identifiers. `h1`–`h3` use the display face automatically. Tabular figures (`.tnum`) for every number that sits in a column or changes.

| Class | Size / line height | Use |
| --- | --- | --- |
| `text-2xs` | 11.5 / 16 | Eyebrows only (uppercase, tracked) |
| `text-xs` – `text-sm` | 12 / 16, 13 / 20 | Chips, axis labels, secondary text |
| `text-base` – `text-md` | 14 / 22, 15 / 24 | Body, list titles |
| `text-lg` – `text-xl` | 17 / 26, 20 / 28 | Lead paragraphs, card titles |
| `text-2xl` – `text-3xl` | 24 / 31, 30 / 36 | Section titles, figures |
| `text-4xl` – `text-6xl` | 38 / 44 to 60 / 62 | Page headlines, hero figures |

Nothing below 12px carries meaning. Headlines use negative tracking; body text does not.

## Shape, space, elevation

- **Radius**: pills (`rounded-full`) for buttons, chips and segmented controls; 14px icon tiles; 16–22px inner cards; 24–28px section cards.
- **Spacing**: a 4px grid. 20px between bento cells (`gap-5`), 24–36px card padding.
- **Elevation**: one card shadow and one popover shadow (`--shadow-pop`). Everything else is colored glow.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` / `--dur` / `--dur-slow` | 120 / 200 / 320ms | Hover and press / toggles and fades / disclosures |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Things arriving |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | The routing packet moving between stages |

- **Routing flow:** stages resolve every 280ms; the violet progress track follows; the decision core lights; the chosen route draws in over 520ms, then light pulses keep travelling it, and the destination lands with one ring in its own hue. It replays only when the route changes; static receipts never animate.
- **Routing map (Overview):** pulses travel each beam; destination nodes breathe; the dashed outer orbit turns once every 48s.
- **Sections** enter with a 70ms stagger.

Under reduced motion there are no pulses, no ambient drift and no entrance animation; every final state renders immediately. Animation uses opacity, transforms, SVG stroke offsets and SVG motion paths only.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `TopBar`, `CommandPalette` | `shell/topbar.tsx`, `shell/command-palette.tsx` | Search and jump (⌘K / Ctrl+K) to any page or scenario, Portfolio Mode pill, engine status, theme. |
| `Sidebar`, `MobileTopBar`, `MobileTabBar` | `shell/sidebar.tsx`, `shell/mobile-nav.tsx` | Floating sidebar; the active item is a lit violet tile. Bottom tabs plus a "More" sheet on phones. |
| `PageHeader` | `ui/page-header.tsx` | Pill eyebrow, display headline with brand accents, description, note, actions. |
| `Button`, `buttonClass` | `ui/primitives.tsx` | `primary` (`btn-brand`, one per view), `secondary` (glass pill), `ghost`, `danger`; at least 40px tall on phones. |
| `DestinationBadge`, `ClassificationChip`, `ModeTag` | `ui/badges.tsx` | Pills with icon and label. `ModeTag` says how output was produced: `Local run`, `Live API`, `Simulated`, `Recorded run`, `Blocked`, `Failed`. |
| `HeroCard`, `OrbitCard`, `DestinationTiles`, `TrafficCard`, `EconomicsCard`, `GovernanceTiles`, `Leaderboard` | `overview/story.tsx` | The Overview bento. |
| `RouteOrbit` | `overview/route-orbit.tsx` | The routing map: core, four destinations, beams sized by volume. |
| `AreaSpark`, `RadialGauge`, `MiniRing`, `DotMeter`, `Radar` | `charts/viz.tsx` | Glowing sparklines, ring gauges, dot matrices and capability radars, each with an accessible name. |
| `StackedColumns` | `charts/charts.tsx` | Gradient columns with totals, glow on hover and accessible per-column names. |
| `RouteFlow` | `routing/route-flow.tsx` | The signature view, in three layouts chosen by container width: a fan into stacked destinations (≥ 72rem), a bus into a row of destinations (46–72rem), a vertical timeline (narrower). Fallbacks and Budget Guard reroutes keep the abandoned route visible, dashed and marked ✕. Review is a bracket after the destination, because it happens after the model runs. |
| `OutcomeCard`, `WhyList`, `DecisionDetails` | `routing/decision-panel.tsx` | The glowing answer with stat tiles, the reasons in plain words (each keeps the engine's exact message as detail), and the deep layer. |
| `ScenarioStories` | `routing/scenario-stories.tsx` | The six scenarios as cards with a small route illustration. |
| `ValueMap`, `ValueTakeaways` | `compare/value-map.tsx` | Quality against API cost, with the quality bar drawn in, plus the two value lessons from the same decision. |
| `ModelCards`, `CapabilityProfiles` | `models/registry.tsx` | Model cards and radar profiles; the values are also listed as text. |
| `DecisionList`, `RequestDetail` | `requests/*` | Decision rows with destination tiles; the decision receipt. |
| `Disclosure`, `Segmented` | `ui/disclosure.tsx`, `ui/segmented.tsx` | Progressive disclosure (`inert` when closed); radio groups for modes and classification. |

Presentation logic that turns engine output into words and stages lives in `src/lib/routing-view.ts`. It never changes a routing decision, only how it is explained.

## Data visualization

- **Categorical color is destinations only.** Model charts color by the model's location. Brand violet appears only on single-value figures (the economics gauge, and the session budget gauge while it is below 70%), never as a series.
- **Every chart keeps a text equivalent**: per-column accessible names, labeled tiles with numbers, listed radar values, or the side-by-side table under the value map.
- **Marks** are rounded with 2–3px gaps between segments. Grid lines are dashed and recessive, and totals are labeled on the columns.
- **Meters carry status**: calm below 70%, `review` from 70%, `danger` from 90%, always with the number in text.
- **One axis per chart.** The value map's x axis is logarithmic and says so, with local models in their own $0 lane.

## Copy

- Plain verbs and outcomes: "Runs on-device", "Blocked: nothing will run", "Rerouted by Budget Guard".
- Blocked is presented as protection ("Failing closed is the policy working"), not as an error.
- Estimates say "estimated" or "est."; recorded runs say "recorded"; simulated output says "simulated". Cost reads "$0 API" for local runs, because compute is not free.

## Accessibility

- Text contrast ≥ 4.5:1 in both themes (`fg-4` is decorative only). Focus rings use `--ring` (violet) and are always visible on keyboard focus.
- Every control has a visible label or an `aria-label`. Scrollable regions are focusable and named; the Portfolio Mode banner is an `aside` landmark.
- The routing drawings are hidden from assistive technology; the outcome is announced through a polite live region. The Overview routing map has a summary as its accessible name.
- Buttons, segmented controls and icon buttons are at least 40px tall on phones. The phone layout uses a bottom tab bar and adds bottom padding so content is never covered.
