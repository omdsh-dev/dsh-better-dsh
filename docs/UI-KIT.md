# UI kit — Better DSH bundle and sub-plugins

One flat visual system for every browser surface in this bundle: the Better DSH hub,
all row-config settings pages, and the conversation surfaces owned by
`dsh-better-goal` and `dsh-better-ask-user`.

The clients are independent, zero-build module-loader closures. They cannot
share a runtime package without adding a dependency or a build step, so the
contract is duplicated in each client's CSS and verified by a browser
computed-style audit. Keep the values here and in every client in sync.

## 1. Tokens

Every client root maps host tokens to these local names. Use the local names in
component rules; do not hard-code surfaces.

| Role | Light | Dark |
| --- | --- | --- |
| surface canvas | `var(--dsw-alias-bg-layer-1)` | host dark layer 1 |
| surface raised | `var(--dsw-alias-bg-layer-2)` | host dark layer 2 |
| surface overlay | `var(--dsw-alias-bg-layer-3)` | host dark layer 3 |
| surface sunken | `color-mix(in srgb, ink-1 4%, canvas)` | same rule |
| ink 1 / 2 / 3 | `--dsw-alias-label-primary/secondary/tertiary` | host dark labels |
| line 1 / 2 / 3 | `--dsw-alias-border-l1/l2/l3` | host dark borders |
| accent / focus | `--dsw-alias-state-business-primary` | host dark business color |
| primary action / switch fill | `--dsw-alias-button-primary-fill` | host dark button fill |
| primary action foreground | `--dsw-alias-label-primary-foreground` | host dark foreground |
| accent text | `color-mix(in srgb, accent 70%, ink-1)` | same rule |
| accent soft | `color-mix(in srgb, accent 10%, transparent)` | 14% |
| success / danger / warn | `--dsw-alias-state-*` | host dark state tokens |
| radius sm / md / lg / xl | `6 / 8 / 10 / 12px` | same |
| control / control-sm | `32 / 28px` | same |
| duration | `140ms` | same |

Ink 3 is mixed 80% tertiary + 20% ink 1 so 12px labels reach AA on white
(the host tertiary alone is 3.7:1). Semantic text mixes 60% host state color
+ 40% ink 1 for the same reason; dots and borders may use the pure host color.
Keep the same mixes in every client.

Rules:

- All borders are 1px solid. No dashed decorative borders, no gradients, no
  grid/dot backgrounds, no glass blur, no glow, no decorative vertical bars.
- Shadows only on overlays (menus, dialogs, toasts).
- Use `tabular-nums` for every comparable number.
- Use the mono stack only for model ids, paths, ids and shortcuts.
- Dark theme is detected by `[data-ds-dark-theme]` on the host body.

## 2. Layout

### Hub

- Dialog max width 1240px, content height `min(760px, 100dvh - 96px)`.
- Header 56px: brand mark + wordmark (14/500) + 28px close. No subtitle.
- Rail 200px: 36px items, 8px radius. Active = accent-soft background +
  accent-text + 1px line; no left decoration bar.
- Content padding 24px 32px; each page is a max-920px column, centered.
- Narrow `<= 800px`: rail becomes a horizontal scrolling tab strip; content
  padding 16px. At `<= 640px` the dialog fills the viewport with no outer
  margin or corner radius.

### Settings page

- Content column `max-width: 920px; margin: 0 auto`.
- Page title 20/28/500, letter-spacing -0.01em.
- Section label 12/500, ink-3, no rule; section spacing 24px.
- Setting row: label 13/500; control right-aligned. Add one neutral consequence
  line (12/ink-3) only when the label cannot explain the choice. Row padding
  10–12px with a hover surface; no per-row divider. Explain model recommendations
  and their scope where they are edited; do not hide essential effects in
  screen-reader-only text.
- Dividers are reserved for group boundaries (footer, cards, inputs,
  selectable rows). A form of anonymous horizontal rules between every row is a
  bug, not a style.
- Everyday settings contain no compatibility notes, migration history, package
  ownership or implementation terminology. Keep actionable loading, read-only,
  conflict and reload feedback next to the affected controls.
- Use sections, not card grids. Cards are reserved for selectable strategy
  cards, read-only budget panels, conversation cards and overlays.
- Save footer: normal flow at the end, 1px top line, canvas background, 12px padding; only
  visible while dirty, busy or showing a notice. Status left, actions right.

### Editable compaction process

- Use one bold visualization as the primary surface: a capacity bar with drag
  handles, four strategy cards (native, goal-aware, handoff, custom), a compact
  generation row, and a custom-prompt editor. Edit the existing configuration
  draft through these controls; saving and discarding use the same form.
- The capacity bar supports pointer dragging and keyboard adjustment
  (`role=slider`), with one synchronized numeric field per value. Do not repeat
  the bar as full-width range sliders. If the model window is unknown, show a
  proportional schematic and say so; never invent token totals.
- The four strategy cards are compact choices: title, tag and one-line effect,
  no repeated mini-diagrams. On wide screens they sit in a two-column
  **选择 | 示意图** layout: choices on the left, one shared SVG process drawing on
  the right, capped at 400px so it fits beside the choices. It uses labeled
  nodes and arrows for context, trigger, summary and continuation; it stacks
  below the choices on narrow screens.
  Selected state uses accent border + accent-soft + check; keyboard arrows,
  Home/End and Space/Enter work.
- Custom mode is the fourth strategy: its expanded prompt is the only
  instruction sent to the summary model. It appends no built-in structure,
  state block or safety rules; the ten `{{variable}}` chips are the only
  context injection. Entering custom mode with an empty prompt pre-fills the
  **goal-mode default instruction** as an editable template; never overwrite an
  existing prompt. Clearing the pre-filled text blocks saving; output must be
  non-empty. Built-in modes never use the custom prompt.
- Capacity, reserved output and measured usage are observations. Unknown values
  stay unknown; do not present active-engine estimates as a prediction of
  unsaved settings.
- Keep only genuinely rare advanced policies and long read-only diagnostics
  expandable. Behavior and effect settings are always visible.

### Narrow `<= 640px`

- Field rows stack: label above, control full width, touch targets 44px.
- Binary switches stay beside their labels, with a 44px hit area. Help buttons
  are 44px, with descriptions contained inside the content column.
- Tables become cards. Read-only diagrams may become value rows. The editable
  compaction process reflows into connected vertical stages and keeps its controls
  available; never shrink the entire diagram into unreadable labels.
- No horizontal scrolling at 390px.

## 3. Controls

| Control | Contract |
| --- | --- |
| Button | 32px; radius 8; 13/500; primary host button fill/foreground, secondary 1px line-2, ghost transparent; hover line-1 fill; focus 2px accent ring offset 2; disabled .4; loading spinner 12px |
| Text input / textarea | 32px; radius 8; 1px line-2; raised background; focus accent border + ring; number inputs tabular, no native spinners |
| Combobox | trigger shaped like text input; menu overlay surface, 1px line-3, radius 10, 4px padding, shadow; option 30px, radius 6, selected accent-soft + accent-text + check; ArrowUp/Down, Home/End, Enter/Space, Escape, typeahead; flip above when short; no native select/datalist |
| Segmented | container 32px, sunken, 1px line-2, radius 8; item 28px radius 6; selected raised + 1px line + accent-text 500; Arrow keys/Home/End; used for tabs and exclusive modes |
| Switch | 34×20 track, 2px padding, 14px thumb; on host button fill/foreground, off sunken + line-3; focus ring; disabled .4 |
| Range | 4px track, accent filled portion, 14px thumb with 2px accent ring; number readout tabular and 76px wide |
| Choice card | 1px line-2, radius 10, padding 12; selected 1px accent + accent-soft; title 13/500, one line of 12/ink-3, schematic 120–160px; radio semantics |
| Chip / badge | 20px high, 11px, 1px line, radius 999; status only; at most one emphasized badge per screen |
| Details | summary 28–32px, 6px chevron, Escape closes; only for rare advanced fields and long read-only diagnostics; behavior settings never hide here |
| Dialog / overlay | 1px line-2, radius 12; focus trapped and returned; Escape closes; shadow only here |

Keyboard:

- Tab follows visual order; Enter activates; Escape closes the innermost layer.
- Segmented groups use arrow keys, Home and End.
- Combobox keeps focus on the trigger and uses aria-activedescendant.
- IME composition never triggers global shortcuts.

## 4. Copy

Visible copy is only: label, current value, unit, state, action, error or
dependency. Move mechanism explanations into `title`, `aria-describedby` or a
collapsed details region.

Remove:

- duplicate page/section headings;
- long mechanism paragraphs, budget rule prose, keyboard hints;
- "typing restarts", "you can still answer", repeated disabled explanations;
- bilingual duplicates and slogans.

Keep:

- consequences that prevent a wrong choice: both scopes off, invalid route,
  unsupported effort, model outside catalog, reload required, read-only,
  conflict, save failure, permission consequences;
- page titles that match the hub navigation.

## 5. Test contracts

Do not rename or remove selectors/ids/data attributes asserted by existing
tests. Add classes instead. In particular:

- Better DSH: one `.apollo-root`, `.apollo-cfg[data-settings-dirty]`,
  `.apollo-footer` hidden semantics, `.apollo-pageTitle`, `.apollo-switch`,
  hub tab roles.
- Subagent: `.bs-root`, `.bs-title h2`, `.bs-header`, `.bs-switch`,
  `.bs-advanced`, `.bs-cellLabel`, `.bs-footer` first child `.bs-status`,
  `.bs-feedback`, `.bs-overviewGlyph`, combobox roles/ids, CSS literals.
- Compact: `.dsh-bc-page`, four `data-mode` radios, `data-bc=capacity-bar`,
  `[role=slider]` handles, `data-bc-section=capacity|strategy|generation|prompt`,
  `data-bc=process-result`, custom-prompt textarea and variable buttons,
  form names/ids.
- Goal: `.dbg-cfg`, `h3.dbg-title`, `.dbg-section`, implementation/round-mode
  radio ids, `.dbg-runtime`, `.dbg-footer`, `.dbg-status`, dock/history ids.
  Native parameters and round policy are visible; no behavior `dbg-advanced`
  or `dbg-diagnostics` fold.
- Ask-user: `better-ask-user-*` ids, `data-settings-dirty/busy`,
  `data-settings-save`, `data-question-wait`, exact labels/aria.

## 6. Review checklist

- [ ] Light, dark and 390px screenshots inspected; no clipping or horizontal scroll.
- [ ] Only 1px solid borders; no gradients, dot/grid backgrounds, glass or glow.
- [ ] The same control has the same geometry on every page.
- [ ] At most one solid accent block per screen; at most two semantic color families.
- [ ] Numeric values tabular; mono only for ids/paths/model names.
- [ ] Keyboard can complete every flow; Escape closes the innermost layer.
- [ ] Save bar appears only when dirty/busy; close guard still works.
- [ ] Hidden panes do not poll or fetch.
