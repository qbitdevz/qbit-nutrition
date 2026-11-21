# 05 — UI/UX Specification and Design System

This document sets direction and tokens. Screen mockups are a separate step
and should be produced and reviewed before implementing each screen.

## 1. Direction: the nutrition label

The visual language borrows from the printed nutrition facts label: black
type on a pale ground, heavy horizontal rules, large numerals, and no
decoration. It is immediately readable as "nutrition", it is not the green
gradient most trackers use, and it keeps the interface quiet so the food
photo is the only colorful thing on screen.

Rules that follow from it:

- **Numbers are the heroes.** The biggest element on any screen is a number.
- **Rules, not cards.** Sections are separated by lines of varying weight,
  not by shadows or rounded boxes.
- **One accent.** A single warm color marks the primary action and nothing
  else.
- **The photo brings the color.** Chrome stays neutral.

## 2. Color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#FAF7F0` | `#141311` | Screen background |
| `surface` | `#FFFFFF` | `#1E1C19` | Sheets, inputs |
| `ink` | `#151412` | `#F3EFE6` | Text, rules, icons |
| `ink-muted` | `#5E5A52` | `#A8A297` | Secondary text |
| `rule` | `#151412` | `#F3EFE6` | Heavy and hairline dividers |
| `accent` | `#D9480F` | `#FF7A45` | Primary action, focus ring |
| `on-accent` | `#FFFFFF` | `#141311` | Text on the accent |
| `protein` | `#1F5FBF` | `#7FB0FF` | Protein series |
| `carbs` | `#B7791F` | `#F2C36B` | Carbohydrate series |
| `fat` | `#7A3E9D` | `#C99BE8` | Fat series |
| `warning` | `#8A5A00` | `#F2C36B` | Low confidence, AI estimate |
| `danger` | `#B3261E` | `#FF8A80` | Destructive actions, errors |

Constraints:

- Every text and background pair must reach WCAG 2.2 AA contrast (4.5:1 for
  body text, 3:1 for large text and graphical elements). The hex values
  above are a starting point and must be checked with a contrast tool before
  they are frozen.
- Macronutrient colors never carry meaning alone: each series also has a
  text label and a fixed position (protein, carbohydrate, fat, in that
  order).
- Going over a target uses `ink`, not `danger`. Red is reserved for errors
  and deletion.

## 3. Typography

One sans-serif family with tabular numerals, used at few sizes with strong
weight contrast. Recommended: **Inter** (SIL Open Font License, compatible
with MIT distribution); the system font is the fallback.

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Display | 56 / 60 | 800 | Calories remaining |
| Title | 28 / 32 | 800 | Screen titles |
| Heading | 20 / 26 | 700 | Section headings, meal names |
| Body | 16 / 24 | 400 | Default text |
| Label | 13 / 16 | 600, uppercase, +4% tracking | Units, column headers |
| Numeric | Same as its context | 700, tabular figures | Any nutrient value |

- All numbers use tabular figures so columns align and values do not jump
  when they change.
- Text respects the system font scale up to 200% without truncating values.

## 4. Spacing, shape, and elevation

| Token | Value |
| --- | --- |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48 |
| Screen margin | 20 |
| Touch target | At least 48 × 48 dp |
| Corner radius | 4 for inputs and buttons; 0 for sections; 12 for photos only |
| Rule weights | 1 (hairline), 4 (section), 8 (screen header) |
| Elevation | None, except bottom sheets and the scan button |

## 5. Components

| Component | Specification |
| --- | --- |
| **Primary button** | Filled `accent`, label in sentence case, full width at the bottom of the screen. One per screen. |
| **Secondary button** | 1.5 px `ink` outline, transparent fill. |
| **Scan button** | Circular, 64 dp, `accent`, centered in the tab bar and raised above it. The only circular control in the app. |
| **Nutrient row** | Label left, value and unit right, hairline below. Indented rows for sub-values such as saturated fat under fat. |
| **Macro bar** | Thin horizontal bar per macronutrient with "consumed / target g" as text. Over-target shows the overflow as a hatched segment. |
| **Item row** (Review) | Name, grams with − and + steppers, calories. State mark at the row's leading edge: none for matched, a dashed outline tag "AI estimate", a check for confirmed. |
| **Confidence mark** | Shown only when confidence is low: a small `warning` tag reading "check portion" or "check food". |
| **Bottom sheet** | Used for portion entry and meal slot. Dismissible by swipe and by an explicit close control. |
| **Insight line** | One sentence under the daily summary, body size, no icon, no card. |
| **Empty state** | One sentence and one action. No illustrations. |
| **Snackbar** | Confirmation with "Undo" for removals, visible for 5 seconds. |

## 6. Key screens

### Today

```
┌──────────────────────────────────────┐
│ Tue 21 Nov                 ‹  ›   ⚙  │
│ ████████████████████████████████████ │  8 px rule
│ Calories left                        │
│ 1,240                                │  display
│ 860 eaten · 2,100 target             │
│ ──────────────────────────────────── │
│ Protein   62 / 140 g  ▓▓▓▓░░░░░░     │
│ Carbs     98 / 220 g  ▓▓▓▓░░░░░░     │
│ Fat       28 / 70 g   ▓▓▓▓░░░░░░     │
│ ──────────────────────────────────── │
│ You still need 78 g of protein.      │  insight
│ ████████████████████████████████████ │  4 px rule
│ BREAKFAST                    410 kcal│
│  ▢ Oatmeal with banana               │
│ LUNCH                        450 kcal│
│  ▢ Chicken, rice, salad              │
│ DINNER                         — add │
├──────────────────────────────────────┤
│  Today         ( Scan )     Progress │
└──────────────────────────────────────┘
```

Order of importance: calories left, macronutrients, insight, meals.

### Scan — Review

```
┌──────────────────────────────────────┐
│ ✕                          Retake    │
│ [ photo strip, 16:9 ]                │
│ ████████████████████████████████████ │
│ Grilled chicken breast               │
│   − 150 g +                 248 kcal │
│ ──────────────────────────────────── │
│ White rice, cooked   ⚠ check portion │
│   − 180 g +                 234 kcal │
│ ──────────────────────────────────── │
│ ┆AI estimate┆ Chimichurri            │
│   −  15 g +                  60 kcal │
│ ──────────────────────────────────── │
│ + Add item                           │
│ ████████████████████████████████████ │
│ 542 kcal   P 52  C 51  F 14          │
│ Lunch ▾                              │
│ [            Save meal             ] │
└──────────────────────────────────────┘
```

The totals bar and "Save meal" stay fixed while the list scrolls.

### Camera

Full-bleed viewfinder. Shutter centered at the bottom, gallery at the left,
flash at the right, close at the top left. No overlays except the first-use
tip.

## 7. Motion

- Durations of 150 to 250 ms with standard easing; nothing bounces.
- Numbers count to their new value over 300 ms when totals change.
- All motion is removed when the system "reduce motion" setting is on.

## 8. Voice and wording

- Plain and neutral. "Calories left", not "You're crushing it!".
- No moral words about food: never "cheat", "bad", "guilt-free", "clean".
- Errors say what happened and what to do next, in one sentence each.
- Sentence case everywhere except the Label style.
- Spanish uses neutral, international Spanish with "tú" forms, so it reads
  naturally across countries. Numbers and dates follow the device locale.

## 9. Accessibility checklist

- Contrast verified per section 2; charts are readable in grayscale.
- Every control has an accessible name; steppers announce the new value
  ("150 grams").
- Focus order follows reading order; the review list is operable without
  swipe gestures.
- Touch targets meet section 4; adjacent steppers have at least 8 dp between
  them.
- Layout holds at 200% font scale and in landscape.
