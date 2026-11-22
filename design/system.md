# Qbit Nutrition design system (proposed starter)

**Status: proposed starter system, not synced from the project.** Only the colors listed under "Brand facts" and the three light-theme variants come from the owner. Every other value (surfaces, text colors, macro colors, type scale, spacing, radius, motion) is a proposal for the owner to accept or change. `src/ui/tokens.ts` holds the superseded "nutrition label" direction from `docs/05-design-system.md`; it is intentionally not synced and must not be reused. The qbitdev logo asset is not in this repository, so the app uses a text wordmark ("Qbit Nutrition" with a small "by qbitdev"), never a drawn logo.

Used by: `design/qbit-nutrition-app/` (three directions). Spec: `odd/tasks/phase-1-manual-tracker.md`, T3 and the design step that precedes it. Voice and accessibility rules from `docs/05-design-system.md` sections 8 and 9 still apply.

## Brand facts

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-brand-bg` | `#04070D` | Background near-black. | owner brand facts |
| `--qn-brand-blue` | `#2D7FFF` | Primary blue. | owner brand facts |
| `--qn-brand-cyan` | `#35E0FF` | Cyan, used for AI. | owner brand facts |
| `--qn-brand-green` | `#3DFF8B` | Brand green. | owner brand facts |
| `--qn-brand-display-face` | `Outfit` | Display typeface of the brand. | owner brand facts |
| `--qn-brand-wordmark` | `blue to cyan to green gradient` | Wordmarks are set in this gradient. | owner brand facts |

Known contrast facts (verified below): white on `#2D7FFF` is 3.76:1 and fails AA for body text, so primary buttons on dark use ink `#04070D` (5.37:1). On light surfaces the owner's darker variants apply: primary `#1C5FD6`, AI `#08687A`, green `#0B7536`.

## Dark color tokens

Default theme (`:root`). Source: proposal built on the brand colors.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-bg` | `#04070D` | Screen background. Brand near-black. | owner brand colors |
| `--qn-surface` | `#0B111C` | Cards, list rows, sheets. | proposal |
| `--qn-surface-raised` | `#121A29` | Raised panels, docks, inputs. | proposal |
| `--qn-surface-high` | `#1B2638` | Bar tracks, pressed states, toast. | proposal |
| `--qn-border` | `#1F2A3D` | Decorative hairlines only (not a control boundary). | proposal |
| `--qn-border-strong` | `#5B6B88` | Control boundaries (steppers, outlined buttons). | proposal |
| `--qn-text` | `#EEF3FB` | Primary text. | proposal |
| `--qn-text-muted` | `#A3B0C8` | Secondary text, units, metadata. | proposal |
| `--qn-primary` | `#2D7FFF` | Brand blue. Fills, rings, icons, selected states. | owner brand colors |
| `--qn-primary-text` | `#5B9BFF` | Blue used as small text or links. | proposal |
| `--qn-on-primary` | `#04070D` | Ink on primary fills (white on #2D7FFF is only 3.76:1). | owner brand colors |
| `--qn-primary-soft` | `#0E2144` | Tinted background for info rows. | proposal |
| `--qn-ai` | `#35E0FF` | Brand cyan. Reserved for AI-related elements only. | owner brand colors |
| `--qn-on-ai` | `#04070D` | Ink on AI fills. | owner brand colors |
| `--qn-ai-soft` | `#06303A` | Tinted background for AI chips. | proposal |
| `--qn-green` | `#3DFF8B` | Brand green. Success, confirmed items. | owner brand colors |
| `--qn-protein` | `#3DFF8B` | Protein bars and fills. | owner brand colors |
| `--qn-carbs` | `#FFC857` | Carbohydrate bars and fills. | proposal |
| `--qn-fat` | `#C7A6FF` | Fat bars and fills. | proposal |
| `--qn-warning` | `#FFB020` | Notices that need attention (limits, low confidence). Always with an icon and text. | proposal |
| `--qn-warning-soft` | `#33240A` | Tinted background for notices. | proposal |
| `--qn-focus` | `#FFFFFF` | Keyboard focus ring. | proposal |
| `--qn-scrim` | `rgba(2, 4, 8, 0.72)` | Backdrop behind sheets and dialogs. | proposal |

## Light color tokens

`[data-theme="light"]`. Same token names, darker brand variants.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-bg` | `#F4F7FC` | Screen background. | proposal |
| `--qn-surface` | `#FFFFFF` | Cards, list rows, sheets. | proposal |
| `--qn-surface-raised` | `#E8EEF9` | Raised panels, bar tracks, inputs. | proposal |
| `--qn-surface-high` | `#DCE5F4` | Pressed states, toast. | proposal |
| `--qn-border` | `#D3DCEC` | Decorative hairlines only. | proposal |
| `--qn-border-strong` | `#6B7C9A` | Control boundaries. | proposal |
| `--qn-text` | `#0A1220` | Primary text. | proposal |
| `--qn-text-muted` | `#475674` | Secondary text, units, metadata. | proposal |
| `--qn-primary` | `#1C5FD6` | Darker brand blue for light surfaces (from the owner's light theme). | owner light-theme variants |
| `--qn-primary-text` | `#1C5FD6` | Blue used as small text or links. | owner light-theme variants |
| `--qn-on-primary` | `#FFFFFF` | White on primary fills. | proposal |
| `--qn-primary-soft` | `#E1ECFF` | Tinted background for info rows. | proposal |
| `--qn-ai` | `#08687A` | Darker cyan for light surfaces. AI-related elements only. | owner light-theme variants |
| `--qn-on-ai` | `#FFFFFF` | White on AI fills. | proposal |
| `--qn-ai-soft` | `#DDF2F6` | Tinted background for AI chips. | proposal |
| `--qn-green` | `#0B7536` | Darker brand green. Success, confirmed items. | owner light-theme variants |
| `--qn-protein` | `#0B7536` | Protein bars and fills. | owner light-theme variants |
| `--qn-carbs` | `#9A5B00` | Carbohydrate bars and fills. | proposal |
| `--qn-fat` | `#6B3FD1` | Fat bars and fills. | proposal |
| `--qn-warning` | `#8A5A00` | Notices that need attention. Always with an icon and text. | proposal |
| `--qn-warning-soft` | `#FFF0D1` | Tinted background for notices. | proposal |
| `--qn-focus` | `#0A1220` | Keyboard focus ring. | proposal |
| `--qn-scrim` | `rgba(10, 18, 32, 0.5)` | Backdrop behind sheets and dialogs. | proposal |

## Color rules

- Cyan (`--qn-ai`) is reserved for AI-related elements: the "AI estimate" tag, the AI provider chip, the scan beam in the analyzing view. Nothing else is cyan. The wordmark gradient is the one brand exception.
- Never convey state by color alone: every state has a label, icon, or shape (Catalog / AI estimate / Confirmed / Low confidence tags; selected segments are filled or outlined with a check; macro bars always carry the macro name and grams).
- Going over a target is neutral: the same blue, the label "kcal over target", no red, no warning icon.
- Warning amber is for notices that need attention (limit reached, low confidence). It always comes with an icon and text.
- Control boundaries use `--qn-border-strong` (at least 3:1). `--qn-border` is decorative only.

## Contrast ratios (computed, WCAG 2.x relative luminance)

Computed from the hex values above. Text needs 4.5:1; non-text (control boundaries, fills against tracks, focus ring) needs 3:1.

### Dark

| Pair | Colors | Ratio | Needs | Result |
| --- | --- | --- | --- | --- |
| Body text | `#EEF3FB` on `#04070D` | 18.10:1 | 4.5:1 | Pass |
| Body text | `#EEF3FB` on `#0B111C` | 16.96:1 | 4.5:1 | Pass |
| Body text | `#EEF3FB` on `#121A29` | 15.64:1 | 4.5:1 | Pass |
| Secondary text | `#A3B0C8` on `#04070D` | 9.22:1 | 4.5:1 | Pass |
| Secondary text | `#A3B0C8` on `#0B111C` | 8.64:1 | 4.5:1 | Pass |
| Secondary text | `#A3B0C8` on `#121A29` | 7.96:1 | 4.5:1 | Pass |
| Blue small text and links | `#5B9BFF` on `#04070D` | 7.28:1 | 4.5:1 | Pass |
| Blue small text and links | `#5B9BFF` on `#0B111C` | 6.82:1 | 4.5:1 | Pass |
| Blue small text and links | `#5B9BFF` on `#121A29` | 6.29:1 | 4.5:1 | Pass |
| Blue text on info row | `#5B9BFF` on `#0E2144` | 5.74:1 | 4.5:1 | Pass |
| Primary button label | `#04070D` on `#2D7FFF` | 5.37:1 | 4.5:1 | Pass |
| AI text on surface | `#35E0FF` on `#0B111C` | 11.93:1 | 4.5:1 | Pass |
| AI chip text | `#35E0FF` on `#06303A` | 8.89:1 | 4.5:1 | Pass |
| AI fill label | `#04070D` on `#35E0FF` | 12.73:1 | 4.5:1 | Pass |
| Confirmed text on surface | `#3DFF8B` on `#0B111C` | 14.29:1 | 4.5:1 | Pass |
| Notice text on surface | `#FFB020` on `#0B111C` | 10.33:1 | 4.5:1 | Pass |
| Notice text on notice background | `#FFB020` on `#33240A` | 8.22:1 | 4.5:1 | Pass |
| Body text on notice background | `#EEF3FB` on `#33240A` | 13.49:1 | 4.5:1 | Pass |
| Body text on info row | `#EEF3FB` on `#0E2144` | 14.28:1 | 4.5:1 | Pass |
| Control boundary on surface (non-text) | `#5B6B88` on `#0B111C` | 3.51:1 | 3:1 | Pass |
| Control boundary on raised (non-text) | `#5B6B88` on `#121A29` | 3.24:1 | 3:1 | Pass |
| Control boundary on background (non-text) | `#5B6B88` on `#04070D` | 3.75:1 | 3:1 | Pass |
| Ring / selected fill vs raised (non-text) | `#2D7FFF` on `#121A29` | 4.64:1 | 3:1 | Pass |
| Bar fill vs track (non-text) | `#2D7FFF` on `#1B2638` | 4.05:1 | 3:1 | Pass |
| Protein fill vs track (non-text) | `#3DFF8B` on `#1B2638` | 11.50:1 | 3:1 | Pass |
| Carbs fill vs track (non-text) | `#FFC857` on `#1B2638` | 9.89:1 | 3:1 | Pass |
| Fat fill vs track (non-text) | `#C7A6FF` on `#1B2638` | 7.48:1 | 3:1 | Pass |
| Protein label color on surface | `#3DFF8B` on `#0B111C` | 14.29:1 | 4.5:1 | Pass |
| Focus ring vs background (non-text) | `#FFFFFF` on `#04070D` | 20.17:1 | 3:1 | Pass |
| Focus ring vs surface (non-text) | `#FFFFFF` on `#0B111C` | 18.90:1 | 3:1 | Pass |

### Light

| Pair | Colors | Ratio | Needs | Result |
| --- | --- | --- | --- | --- |
| Body text | `#0A1220` on `#F4F7FC` | 17.46:1 | 4.5:1 | Pass |
| Body text | `#0A1220` on `#FFFFFF` | 18.75:1 | 4.5:1 | Pass |
| Body text | `#0A1220` on `#E8EEF9` | 16.09:1 | 4.5:1 | Pass |
| Secondary text | `#475674` on `#F4F7FC` | 6.86:1 | 4.5:1 | Pass |
| Secondary text | `#475674` on `#FFFFFF` | 7.37:1 | 4.5:1 | Pass |
| Secondary text | `#475674` on `#E8EEF9` | 6.32:1 | 4.5:1 | Pass |
| Blue small text and links | `#1C5FD6` on `#F4F7FC` | 5.35:1 | 4.5:1 | Pass |
| Blue small text and links | `#1C5FD6` on `#FFFFFF` | 5.74:1 | 4.5:1 | Pass |
| Blue small text and links | `#1C5FD6` on `#E8EEF9` | 4.93:1 | 4.5:1 | Pass |
| Blue text on info row | `#1C5FD6` on `#E1ECFF` | 4.82:1 | 4.5:1 | Pass |
| Primary button label | `#FFFFFF` on `#1C5FD6` | 5.74:1 | 4.5:1 | Pass |
| AI text on surface | `#08687A` on `#FFFFFF` | 6.42:1 | 4.5:1 | Pass |
| AI chip text | `#08687A` on `#DDF2F6` | 5.53:1 | 4.5:1 | Pass |
| AI fill label | `#FFFFFF` on `#08687A` | 6.42:1 | 4.5:1 | Pass |
| Confirmed text on surface | `#0B7536` on `#FFFFFF` | 5.81:1 | 4.5:1 | Pass |
| Notice text on surface | `#8A5A00` on `#FFFFFF` | 5.93:1 | 4.5:1 | Pass |
| Notice text on notice background | `#8A5A00` on `#FFF0D1` | 5.26:1 | 4.5:1 | Pass |
| Body text on notice background | `#0A1220` on `#FFF0D1` | 16.64:1 | 4.5:1 | Pass |
| Body text on info row | `#0A1220` on `#E1ECFF` | 15.75:1 | 4.5:1 | Pass |
| Control boundary on surface (non-text) | `#6B7C9A` on `#FFFFFF` | 4.22:1 | 3:1 | Pass |
| Control boundary on raised (non-text) | `#6B7C9A` on `#E8EEF9` | 3.62:1 | 3:1 | Pass |
| Control boundary on background (non-text) | `#6B7C9A` on `#F4F7FC` | 3.93:1 | 3:1 | Pass |
| Ring / selected fill vs raised (non-text) | `#1C5FD6` on `#E8EEF9` | 4.93:1 | 3:1 | Pass |
| Bar fill vs track (non-text) | `#1C5FD6` on `#DCE5F4` | 4.53:1 | 3:1 | Pass |
| Protein fill vs track (non-text) | `#0B7536` on `#DCE5F4` | 4.58:1 | 3:1 | Pass |
| Carbs fill vs track (non-text) | `#9A5B00` on `#DCE5F4` | 4.28:1 | 3:1 | Pass |
| Fat fill vs track (non-text) | `#6B3FD1` on `#DCE5F4` | 5.08:1 | 3:1 | Pass |
| Protein label color on surface | `#0B7536` on `#FFFFFF` | 5.81:1 | 4.5:1 | Pass |
| Focus ring vs background (non-text) | `#0A1220` on `#F4F7FC` | 17.46:1 | 3:1 | Pass |
| Focus ring vs surface (non-text) | `#0A1220` on `#FFFFFF` | 18.75:1 | 3:1 | Pass |

### Reference facts

| Pair | Colors | Ratio | Needs | Result |
| --- | --- | --- | --- | --- |
| White text on brand blue (why primary buttons use ink on dark) | `#FFFFFF` on `#2D7FFF` | 3.76:1 | 4.5:1 | FAIL, not used |

## Typography

Implementation typefaces: **Outfit** for display (wordmark, numerals, titles, buttons, item names) and **Figtree** for body text (proposal: a friendly geometric sans with tabular numerals, distinct from but compatible with Outfit's geometry). Artboards must not load fonts, so they use system stacks that stand in for them. Numbers use tabular figures.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-font-display` | `ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", "Segoe UI", Roboto, system-ui, sans-serif` | Artboard stand-in for Outfit (display, numerals, buttons, wordmark). | proposal |
| `--qn-font-body` | `system-ui, "Segoe UI Variable Text", "Segoe UI", Roboto, sans-serif` | Artboard stand-in for Figtree (body). | proposal |

Scale (one role per row; the three directions use different points inside the ranges, which is where their character comes from):

| Token | Value (size / line height / weight) | Usage | Source |
| --- | --- | --- | --- |
| `--qn-text-numeral-xl` | `96px / 100px / 700` | Ledger hero number only (one per screen). | proposal |
| `--qn-text-numeral-lg` | `50–58px / 52–58px / 700` | Ring or gauge number (calories left). | proposal |
| `--qn-text-title` | `22–30px / 28–34px / 700` | Screen titles and state headlines. | proposal |
| `--qn-text-heading` | `18–20px / 24–26px / 700` | Section headings (Meals). | proposal |
| `--qn-text-button` | `17px / 22px / 600` | Button labels and item names, display face. | proposal |
| `--qn-text-body` | `16px / 24px / 400` | Body copy. | proposal |
| `--qn-text-body-sm` | `14–15px / 20–22px / 500` | Secondary text, units, metadata. | proposal |
| `--qn-text-caption` | `12px / 16px / 500–600` | Chips, tab labels, "by qbitdev". Never smaller. | proposal |

Sentence case everywhere. Line length under 40 characters on a phone. Text must reflow at 200% font scale.

## Spacing

4 px base. Screen side padding is 16 or 24 px.

| Token | Value | Source |
| --- | --- | --- |
| `--qn-s1` | `4px` | proposal |
| `--qn-s2` | `8px` | proposal |
| `--qn-s3` | `12px` | proposal |
| `--qn-s4` | `16px` | proposal |
| `--qn-s5` | `20px` | proposal |
| `--qn-s6` | `24px` | proposal |
| `--qn-s8` | `32px` | proposal |
| `--qn-s10` | `40px` | proposal |

## Radius

Rounded buttons are a requirement: every button, chip, stepper, segmented control, and toast is a pill.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-r-xs` | `8px` | Tiny marks, progress ends. | proposal |
| `--qn-r-sm` | `12px` | Small thumbnails. | proposal |
| `--qn-r-md` | `16px` | Meal photos in lists. | proposal |
| `--qn-r-lg` | `24px` | Cards, rows, tiles. | proposal |
| `--qn-r-xl` | `32px` | Sheets, docks, dialogs. | proposal |
| `--qn-r-pill` | `999px` | Every button, chip, stepper, segmented control, toast. | proposal |

## Elevation and glow

Dark theme: surfaces rise by getting lighter (`--qn-surface` to `--qn-surface-high`) with a decorative hairline; shadows are only for floating things. A blue glow marks the single primary action of a screen (scan, save, the selected day) and the ring or gauge arc. Never glow cyan or green; never glow more than one action per screen. Light theme: no glow; a soft blue-tinted shadow on the primary action and a neutral shadow on floating things.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-glow` | `dark: 0 0 0 1px rgba(45,127,255,.5), 0 8px 28px rgba(45,127,255,.38)` | Dark theme, primary action only (scan, save, selected day). | proposal |
| `--qn-glow` | `light: 0 1px 2px rgba(10,18,32,.12), 0 8px 20px rgba(28,95,214,.25)` | Light theme: a soft blue shadow instead of a glow. | proposal |
| `--qn-shadow-pop` | `dark: 0 10px 30px rgba(0,0,0,.55); light: 0 10px 30px rgba(10,18,32,.25)` | Toast and floating dock. | proposal |
| `--qn-wordmark` | `dark: linear-gradient(90deg, #2D7FFF, #35E0FF 55%, #3DFF8B)` | Wordmark "Qbit Nutrition" only. | owner brand facts (gradient colors) |
| `--qn-wordmark` | `light: linear-gradient(90deg, #1C5FD6, #08687A 55%, #0B7536)` | Wordmark on light surfaces. | owner brand facts (gradient colors) |

## Motion

Motion shows what changed; it never delays routine work. Feedback to a touch lands within 100 ms. Everything else is under 500 ms except the one orchestrated moment: numbers and rings filling to their value (1 s) when Today opens and after a save.

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--qn-dur-press` | `100ms` | Press feedback (scale on touch). Must land under 100 ms of perceived response. | proposal |
| `--qn-dur-fast` | `180ms` | Color, chip, check mark, small state changes. | proposal |
| `--qn-dur-base` | `320ms` | Item entrance, toast, dialog fade, stepper bump, segmented thumb. | proposal |
| `--qn-dur-slow` | `480ms` | Screen transitions and sheets. | proposal |
| `--qn-dur-ring` | `1000ms` | Calorie number and ring, gauge, macro bars filling to their value. | proposal |
| `--qn-ease` | `cubic-bezier(.2, 0, 0, 1)` | Standard: color, fades, small moves. | proposal |
| `--qn-ease-out` | `cubic-bezier(.05, .7, .1, 1)` | Entrances, screens, fills (fast start, soft landing). | proposal |
| `--qn-ease-in` | `cubic-bezier(.3, 0, .8, .15)` | Exits only; rarely needed. | proposal |
| `--qn-ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | Confirmations: stepper bump, save check, toast, segmented thumb. | proposal |

### What animates

| Element | Motion | Duration and easing |
| --- | --- | --- |
| Screen change (Today, Review, Error) | Direction-specific: rise as a sheet, push from the right, or slide up over a dimmed Today. Today steps back or dims behind. | slow, ease-out |
| Calorie number | Counts to its value (down from the target when Today opens, from the old value after a save). | ring, ease-out cubic |
| Ring, gauge, meter, macro bars | Fill to their value. | ring, ease-out |
| Stepper and remove buttons | Scale down on press; the grams and kcal numbers bump; totals count to the new value. | press, then base with spring |
| Item rows in Review | Enter in sequence once (55 ms stagger) when the review opens. | base, ease-out |
| Save | Button shows a drawn check and the word "Saved", then Today returns; the new meal drops in with a short blue outline pulse. | base with spring, then 2.2 s fade-out of the outline |
| Scan beam and progress | A cyan beam sweeps the photo and a short bar slides while analyzing (AI element). Only while the provider works. | 1.5 s alternate |
| Toast, dialog | Fade and rise. | base, spring (toast) |
| First-day scan button | Pulses or breathes two or three times, then stops. | 2 s, ease |

Nothing else loops. Hover effects are subtle fills and apply to pointer devices only.

### Reduced motion

`prefers-reduced-motion: reduce` removes all travel and scaling: screens cross-fade in 120 ms, durations drop to near zero, numbers and bars jump to their value, the scan beam stops at the middle of the photo, the progress bar is static, the first-day pulse does not run. The same information remains: totals update, the new meal is still outlined (without pulse), saved state still shows the check and "Saved".

## Components

| Component | Rule |
| --- | --- |
| Primary button | Pill, 56 px high, `--qn-primary` fill, `--qn-on-primary` label, display face 17 px 600, glow in dark. One per screen. Press: scale .97. |
| Secondary button | Pill, 56 px, transparent, 1.5 px `--qn-border-strong` outline. |
| Ghost button | Pill, 56 px, `--qn-primary-text` label, no outline. |
| Disabled | Fill `--qn-surface-high`, text `--qn-text-muted`, never alone: a line of text says why (for example "Add at least one item to save"). |
| Icon button | 48 x 48 minimum, round, accessible name required. |
| Gram stepper | Minus, grams, plus. Buttons 48 x 48, round, outlined with `--qn-border-strong`; the grams value announces the new quantity ("150 grams") through a live region. Minimum portion disables minus. |
| Segmented control (meal) | 4 pills, 48 px high, one selected: filled or outlined with check. Native radios underneath. |
| Item tags | Catalog (neutral), AI estimate (cyan), Confirmed (green with check), Low confidence (amber with alert icon). Always a text label. |
| Meal row | Photo thumbnail, name, slot and time, kcal. Whole row is one 48 px+ button. |
| Totals | kcal large, then protein, carbs, fat with grams in words ("40 g protein"). |
| Toast | Pill; names the action ("Dinner saved · 583 kcal added"); optional Undo button 48 px high; 3 to 5 s. |
| Dialog | Bottom card, focus moves to the safe choice ("Keep editing"), Escape closes. |
| Focus | 3 px ring in `--qn-focus`, 3 px offset, always visible on keyboard focus. |
| Prototype control | The four-segment control in the status bar of every artboard (Today, Empty, Review, Error) is prototype chrome, not part of the app. |

## Decorative values (not tokens)

Used only inside the artboards for atmosphere and overlays; they carry no meaning and need no contrast. If an artboard is implemented, replace them with tokens or drop them.

| Value | Where | Why |
| --- | --- | --- |
| `#102A56`, `#0D2A5E` | Radial ambient tint at the top of Today (Orbit, Bento) | Depth behind the hero. |
| `#06303A` | Ambient teal in Bento; same value as `--qn-ai-soft` | Depth. |
| `#2A1D07` | Ambient tint at the top of the error screen (Orbit) | Warm cue for a notice. |
| `#5B9BFF` to `#2D7FFF` to `#1F63D8` | Scan button gradient (Orbit, Bento); the label or icon sits on the lighter part (at least 5.37:1) | Raised, tactile primary action. |
| `rgba(4, 7, 13, .8)` and `rgba(255, 255, 255, .94)` | Solid-enough chips and back button over photos | Keeps text and icons legible on any photo (dark chip in dark theme, light chip in light theme). |
| Photo colors | CSS and SVG food illustrations | Stand-ins for real meal photos. |

## Voice

Plain and neutral, sentence case, verbs that name the action ("Save meal" then "Dinner saved"). Errors say what happened and what to do next. No moral words about food ("cheat", "bad", "clean", "guilt-free"), no praise copy, no streaks. Going over a target is stated as a number.

## Open questions for the owner

- Accept Figtree as the body face, or choose another.
- Macro colors (green, amber, lavender) and the warning amber are proposals beyond the brand colors.
- Whether the wordmark gradient should also appear in the splash screen and app icon (no logo asset in this repository).
