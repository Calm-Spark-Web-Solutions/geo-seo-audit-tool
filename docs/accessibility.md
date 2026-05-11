## Accessibility (WCAG 2.1 AA) status

This is the residual checklist after the **WCAG AA pass**. Code changes already
shipped:

- `--muted-foreground` and `--ring` color tokens darkened in light mode and
  lightened in dark mode (`app/globals.css`) so muted captions meet 4.5:1 and
  focus rings clear 3:1.
- `TallyBadge` exposes a single `aria-label="N pass, N warning, N fail"` while
  the colored digits are `aria-hidden`.
- `CruxVitalsOverview` adds a visible `Good / Needs work / Poor` status word
  beside each ring and an `aria-label` summarizing metric + value.
- All `text-[10px]` / `text-[11px]` UI text has been bumped to `text-xs`
  (≥ 12 px) — CrUX, `CollapsibleCheckRow`, `StartAuditForm`, dashboard, and
  community detail.
- Skip-to-main link added in the root `<body>` with focus-visible styling, and
  every layout/page now wraps content in `<main id="main">`.
- `SeoGeoCheckTabs` now uses the WAI-ARIA APG roving tab pattern: arrow keys
  (Left/Right/Up/Down + Home/End) move the active tab, only the active tab is
  in the tab order, focus moves with selection.
- `ProgressBar` numeric label is wrapped in `role="status"` + `aria-live="polite"`
  with a screen-reader-only descriptive sentence (`Progress: 12 of 25`).

### Manual sweep (run before any release)

Smoke-test each scenario on at least one of macOS VoiceOver (Cmd+F5) or
Windows NVDA. Mark items as fail and re-open the WCAG plan if something
slips.

Keyboard (no mouse):

- [ ] Tab from page load — first stop is **Skip to main content**, Enter jumps
      past sidebar to first heading.
- [ ] Sidebar nav, `UserMenu`, and `Brand` link are all reachable; focus ring
      is visible against the sidebar background.
- [ ] On `/visibility-scans/[id]/pages/[pageId]`, focus the SEO/GEO tabs: Right Arrow
      switches to GEO and moves focus; Left Arrow returns to SEO; Home/End
      jump to first/last; Tab moves out of the tablist instead of cycling.
- [ ] `<details>` summaries for CrUX breakdown and check rows toggle with
      Enter / Space, never trap focus.
- [ ] Save score selections, Retry runner, Cancel audit are all reachable
      with Tab and have visible focus rings.

Screen reader:

- [ ] On audit page, status badge + tally announces as "Site SEO and content
      checks. 4 pass, 1 warning, 0 fail" (or similar).
- [ ] CrUX rings announce as "LCP (Largest Contentful Paint): Good, ~2.5 s"
      etc. — color is no longer the only differentiator.
- [ ] While an audit is running, the progress region announces "Auditing
      pages: 3 of 25" updates as new pages complete (polite, doesn't interrupt
      reading).
- [ ] Saving score selections triggers a Sonner toast that is announced.

Color & contrast:

- [ ] Run Axe DevTools (or `npx @axe-core/cli`) against `/dashboard`,
      `/communities/[id]`, `/visibility-scans/[id]`, `/visibility-scans/[id]/pages/[pageId]`,
      `/login`, `/signup`. Target **0 serious / critical** issues.
- [ ] Spot-check muted captions, status badges, and ring borders in light +
      dark with Chrome DevTools contrast picker (≥4.5:1 text, ≥3:1 UI).

### Known residual issues / out of scope

- **PDF export accessibility (`@react-pdf/renderer`)** — tagged PDFs are only
  partially supported by the library; out of scope for this pass.
- **Color contrast inside `bg-destructive/10` warning panels** — the icon
  uses the destructive token at 100% opacity, but accompanying body text
  uses `text-destructive-foreground`. Re-verify with the new
  `--muted-foreground` token if a future palette tweak changes those.
- **AAA contrast (7:1)** — explicitly out of scope for this product.
