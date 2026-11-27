# UI kit — Better DSH bundle and sub-plugins

One flat visual system for every browser surface in this bundle: the Better DSH hub,
all row-config settings pages, and the conversation surfaces owned by
`dsh-better-goal` and `dsh-better-ask-user`.

The clients are independent, bundled module-loader closures (esbuild for most packages, tsdown for `dsh-better-compact`). They cannot
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

- Dialog 824 x 800px (max `100dvh - 32px`), 28px radius, overlay shadow.
  Header 54px: 14/500 title at 16px inset, 28px close; no rule under it.
- Data-heavy pages keep the same frame but widen it to 1240px (currently the
  compaction page); nav, header and footer do not change.
- A confirm inside the hub (unsaved changes) is its own 440px dialog with auto
  height, never the full hub frame; on `<= 640px` it stays auto-height.
- Rail: 12px inset + 188px items; 40px items, 12px radius, 14px text, 16px
  icon. Active = 10% ink fill; no accent border and no rail background or rule.
- Content: 36px gap after the rail, 24px right padding, so the page column is
  564px at 1440. No page-level card boxes.
- Footer appears only with a draft or a notice: sticky to the bottom at
  z-index 50, 1px top rule, status on the left, actions on the right (discard,
  then save). It stays above the scrolling page whenever it is shown.
- Narrow `<= 800px`: rail becomes a horizontal scrolling tab strip; content
  padding 16px. The active item is centered in the strip after the window
  narrows and after a tab change, so the current page is never off-screen. At `<= 640px` the dialog fills the viewport with no outer
  margin or corner radius.

### Settings page

- Page column follows the surface: 564px inside the hub; long pages may use
  their own max width (the compaction page 920px) inside a wide frame.
- Page title 15/22/500; one 12/18 subtitle line.
- Section label 14/22/500, ink; section spacing 18px.
- Setting row: label 14/22/400; 12/18 ink-2 description; control right-aligned
  on the first line; 14px vertical padding; 1px divider between rows; no row
  hover surface. Add a consequence line only when the label cannot explain the
  choice. Explain model recommendations and their scope where they are edited;
  do not hide essential effects in screen-reader-only text.
- Save footer (hub and compaction): sticky to the bottom of the dialog at
  z-index 50, status or error text on the left, discard then save on the right.
- A settings page is one scroll: related sections in work order, no inner tab
  strip and no jump buttons to other tabs. The hub rail is the only page
  navigation.
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

- One page, one reading order: **capacity → strategy → generation → advanced → diagnostics**.
  Observation (what the engine currently reports) is never mixed into an editable
  control: the capacity block states the draft's effect in one sentence, the
  numbers below it are inputs.
- Capacity is one bar plus one sentence plus one row per number:
  - The bar is the only visualization: labelled segments (待压缩 / 保留 / 余量),
    one drag handle for retention, and the configured trigger handle.
  - When headroom caps the trigger below the configured ratio, draw the real cut
    as a 1px ink line labelled `压缩点 <ratio>`; the sentence says
    `（受额外余量限制）`. Values are always the effective ones, never a promise.
  - Below the bar: one 3-column fact grid (message budget, effective trigger,
    retained target, summary budget, current usage, model window). Unknown values
    stay unknown and say so; never print a 0 for a missing measurement.
  - Below the facts: setting rows (label left, control right, hover surface, no
    per-row divider) for trigger ratio, retention (segmented + number) and
    headroom. The capacity bar supports pointer dragging and keyboard adjustment
    (`role=slider`); the same values are editable as numbers.
- Strategy: four compact cards in a 2×2 grid — title, tag, one-line effect — and
  one shared SVG process drawing for the selected mode, capped at 400px. On wide
  panes the drawing sits beside the cards; it drops below them under 760px and
  the cards become one column under 560px. No mini-diagram per card.
- Generation is three setting rows: summary model, reasoning effort (hidden in
  native mode) and output cap. The model scope explanation lives under the model
  row, not in the section header.
- Keep only genuinely rare advanced policies (`高级规则`) and long read-only
  diagnostics (`会话诊断`) expandable, collapsed by default. Behavior and effect
  settings are always visible. Do not put a second copy of the observed budget in
  the capacity block: the diagnostics section owns every measured number.
- The draft state is a chip (`未保存`) on the capacity heading while dirty; the
  save footer appears only when dirty, busy or showing a notice.
- Custom mode is the fourth strategy: its expanded prompt is the only
  instruction sent to the summary model. It appends no built-in structure,
  state block or safety rules; the ten `{{variable}}` chips are the only
  context injection. Entering custom mode with an empty prompt pre-fills the
  **goal-mode default instruction** as an editable template; never overwrite an
  existing prompt. Clearing the pre-filled text blocks saving; output must be
  non-empty. Built-in modes never use the custom prompt.

### Goal and question settings

Both row-config pages use the skeleton above: 15/22 page title, one 12/18
subtitle, 14/22 section labels, rows with the label and its 12/18 consequence on
the left and the control on the right, a 1px divider only between adjacent rows,
and the sticky save bar (z-index 50) with status left, discard and save right.

- Goal: a runtime status strip sits under the page header, then continuation
  mode cards, the round policy as a three-item segmented control, and the fixed
  limit or the native parameters as rows. Round pacing (idle-spin threshold,
  background-job wait) follows as rows. The lone disclosure is the 12px
  `设置说明` summary under the runtime strip; it never folds an editable control.
  Switching the driver saves and restarts the profile; the footer states that
  with the pending count and keeps the save disabled while a field is invalid.
- Ask-user: wait mode is a segmented control on the section heading; the
  duration row holds the number and four presets; timeout behavior is one
  bordered group of two radio rows, repeated for active goals, and each row
  keeps its consequence sentence. Unlimited hides the duration and the normal
  timeout group but keeps the goal group. The footer appears only while dirty,
  busy or showing a saved/conflict/error notice, pinned above the content.

### Ask-user conversation cards

- The composer takeover is a 12px-radius card on layer 3 with a 1px line-3
  border. Header 12/16 padding, title 14/20, icon buttons 28. The wait bar is a
  full-width band, not a card inside the card: 1px bottom line, 3% ink tint,
  20px ring, 12/18 status and a ghost `take time` action.
- Options and the custom answer row share the 16px body inset; selected rows use
  a 1px accent border and an 8% accent tint. The footer is a 1px-top band with
  feedback left and skip/next right; targets grow to 44px under 720px.
- Plan review uses the same wait band and footer. The plan summary is a 16px
  inset block with a 14/20 title and a two-line 12/18 description.
- History rows stay 32px summaries; the late-reply bubble is right-aligned,
  10px radius, at most 85% wide, with a 12/16 label and 13/20 summary.

### Narrow `<= 640px`

- Field rows stack: label above, control full width, touch targets 44px.
- Binary switches stay beside their labels, with a 44px hit area. Help buttons
  are 44px, with descriptions contained inside the content column.
- Tables become cards. Read-only diagrams may become value rows. The compaction
  page stacks: setting rows go label-above-control, the capacity fact grid drops
  to one column, strategy cards to one column, and the shared drawing moves below
  them. Never shrink the drawing into unreadable labels, and never hide the
  segment labels on the capacity bar.
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

A label says what the setting does; a description says what the user gets or
loses by changing it. Never name an internal mechanism (`checkpoint`, `checkpoint
bracket`, `native event`) when a plain noun exists.

Compaction glossary — use these words everywhere, in Chinese and English:

| Concept | 中文 | English |
| --- | --- | --- |
| The point where compaction starts | 触发点 | trigger point |
| The configured share of the window | 触发比例 | trigger ratio |
| Space kept free above the trigger point | 压缩余量 | headroom |
| Text kept verbatim | 保留近期原文 | keep recent text |
| The budget for the summary request itself | 摘要预算 / 摘要输出上限 | summary budget / output cap |
| The checkpoint rendered as images | 压缩结果以图片传给模型 | send the checkpoint as images |
| The message that replaces folded history | 摘要记录 | summary record |
| The host's own compaction structure | 宿主原生 | host native |
| Goal/todo-aware summary | 目标增强 | goal-aware |
| Handoff document, same session continues | 文件交接 | file handoff |

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