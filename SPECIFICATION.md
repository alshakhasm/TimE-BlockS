# TimE BlockS – Product & Technical Specification

## 1. Overview
TimE BlockS is a lightweight, client‑side time blocking and planning tool built with vanilla HTML, CSS, and JavaScript. It provides an interactive weekly (and emerging monthly/report) view for creating, organizing, and analyzing time blocks. Persistence is offered locally (localStorage) and optionally in the cloud via Firebase (Auth + Firestore). The app emphasizes zero-build simplicity (ES modules + CDN Firebase) while keeping a path open for future modularization.

## 2. Goals
- Fast, frictionless creation and scheduling of reusable time blocks.
- Intuitive drag & drop across a weekly grid with visual alignment to time slots.
- Quick persistence (local + cloud) without mandatory sign‑in for basic use.
- Per‑user cloud sync when authenticated (Firestore) with minimal UI overhead.
- Lightweight reporting / analytics overlay (weekly & monthly aggregation).
- Operate without a bundler; deployable on static hosting (GitHub Pages).

## 3. Non-Goals (Current)
- Advanced multi-user collaboration or real‑time presence.
- Complex recurrence engines (cron-like or rule-driven repetition).
- Mobile-optimized responsive layout (baseline desktop-focused now).
- Deep accessibility pass (basic ARIA only to date).
- Offline conflict resolution or multi-tab merging logic.

## 4. High-Level Architecture
- Frontend only (no custom backend). All logic lives in `app.js` and inline ES modules in `index.html`.
- Firebase modular SDK (v9-style ESM) for Auth & Firestore; globals exposed (`window.firebaseAuth`, `window.firebaseDb`) to ease incremental migration from prior compat implementation.
- State layers:
  1. In-memory JS objects (`createdBlocks`, `scheduledBlocks`, `savedListBlocks`, `weekOffset`).
  2. Local persistence via `localStorage` (manual & auto-save triggers).
  3. Optional cloud persistence (Firestore per user doc) with debounced sync.
- UI built dynamically: main planner board, block creation palette, reporting overlay.
- No build pipeline; direct DOM manipulation + query selectors.

## 5. Data Model
(All persisted as JSON; Firestore document `users/{uid}/planners/default`.)

```
StateSnapshot {
  weekOffset: number;                     // Week navigation offset from current week
  createdBlocks: BlockTemplate[];         // Reusable block templates user creates
  scheduledBlocks: ScheduledBlock[];      // Blocks placed on the weekly (and dated) grid
  savedListBlocks: BlockTemplate[];       // Saved list of templates separate from created list
  updatedAt: ISODateString;               // Cloud snapshot timestamp
}

BlockTemplate {
  id: string;             // UUID/short id
  name: string;           // User-defined label
  color: string;          // CSS color (HSL/HEX)
  duration: number;       // Minutes (template-level)
}

ScheduledBlock {
  id: string;
  name: string;
  color: string;
  date?: string;          // YYYY-MM-DD if anchored to a specific calendar day
  dayIndex?: number;      // 0-6 (Sun..Sat) if week-relative
  startSlot: number;      // Half-hour slot index from board start
  startHour?: number;     // Derived convenience meta (float)
  durationMinutes?: number; // Duration in minutes
  durationHours?: number;   // Cached hours (for reporting)
}
```

Derived / transient additions (UI only): selection state, drag payloads, DOM dataset attributes.

## 6. Core Features Implemented
### 6.1 Weekly Planner Grid
- Dynamic generation of 7 columns (Sun–Sat) with time slots from configurable start/end hours.
- 30‑minute slot granularity (`SLOTS_PER_HOUR = 2`).
- Drag & drop scheduling of existing templates or newly created blocks.
- Visual alignment & overlap management: blocks positioned & re-aligned when re-rendered.

### 6.2 Block Template Creation & Management
- User can create new block templates (name, color, duration).
- Templates draggable into weekly surface to create scheduled instances.
- Templates removable via drag to trash zone.

### 6.3 Saved List Blocks
- Secondary list (`savedListBlocks`) distinct from active template list for archival or reuse.
- Blocks can be moved between saved list and active list (implementation via array mutations + re-render).

### 6.4 Scheduling & Editing
- Blocks can be dragged between days and time positions.
- Duration honored; blocks maintain height relative to minutes.
- Deletion via dedicated trash drop zone.

### 6.5 Local Persistence
- Manual controls: Save, Load, Clear (localStorage key `timeBlocksState`).
- Auto-save on DOM mutations (configurable debounce; currently immediate with `AUTO_SAVE_DEBOUNCE = 0`).

### 6.6 Cloud Persistence (Firestore)
- Authenticated users can Save to Cloud / Load from Cloud.
- Document path: `users/{uid}/planners/default` with merge writes.
- Debounced auto cloud sync (1.5s) after local saves when signed in.

### 6.7 Authentication (Firebase Email/Password)
- Modular SDK usage: `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`.
- UI toggles auth forms vs. status & logout button.
- Inline error parsing for common misconfigurations (API key invalid, unauthorized domain).

### 6.8 Reporting Overlay
- Launch via "Report" button.
- Overlay with month navigation (prev/next) and optional week selection toggles (W1–W4).
- Aggregates total scheduled + template hours per block name.
- Separate logic for week vs month aggregation; minimal bar visualization (pure CSS/HTML strings).
- Sample data creation helper (when no data available) for previewing the reporting UI.

### 6.9 Drag & Drop Enhancements
- Custom ghost element with content label during drag.
- DataTransfer multi-strategy: structured JSON fallback + window global payload.
- Trash zone highlighting on dragenter/dragover.
- Robust drop handling with fallback elementFromPoint routing.

### 6.10 Debug Utilities
- Optional DEBUG panel with timestamped logs (controlled by `DEBUG` flag).
- Inline dev-only visual aids not shipped behind build tooling (runtime condition checks only).

### 6.11 Live Reload Stub
- Lightweight polling (`/__livereaload`) for development refresh. (Assumes a local dev server exposing that endpoint.)

### 6.12 Accessibility / Semantics (Basic)
- Use of ARIA roles for tablist (view toggle placeholder) and live region for storage status.
- Buttons carry `aria-label` where iconographic.

## 7. Persistence & Sync Flow
1. User performs UI action (create/delete/drag).  
2. Mutation observer or explicit handler triggers `saveState()` → serializes in-memory arrays to localStorage.  
3. Debounced `scheduleCloudSync()` checks if signed in; if yes, calls `saveStateToCloud()` writing merged snapshot to Firestore.  
4. Manual Load (local or cloud) refreshes arrays and re-renders DOM surfaces & aggregates.

## 8. Authentication & Security Considerations
- Email/Password only (no federated providers currently). Google sign-in code removed earlier per requirement.
- Firestore Security Rules (simplified) restrict read/write to the authenticated user's own document path (`users/{uid}/planners/default`).
- No custom claims, no server-side enforcement beyond Firestore rules.
- Configuration pitfalls: API key domain restrictions or Identity Toolkit enablement can block signup (current known issue under remediation).

## 9. Error Handling & UX Resilience
- Auth forms show alerts for validation failures (email format, password length).
- Cloud Save/Load buttons disabled when not authenticated.
- Status text conveys last persistence operation (e.g., "Cloud saved ✓", "Cloud load failed").
- Console warnings for analytics or Firestore initialization failures.

## 10. Performance Notes
- Pure DOM operations; no virtual DOM diffing. Adequate for small/medium block counts.
- Aggregation executed on demand when opening report (O(n) over scheduled + template arrays).
- Debounce timers keep cloud writes bounded.
- No pagination or virtualization (not yet needed given expected scale).

## 11. Limitations / Technical Debt
- API key / Identity Toolkit mismatch under investigation (blocks functional signup at present).
- Month view for main planner UI not fully realized (toggle present; underlying month board incomplete or placeholder logic).
- Lacks full mobile responsive layout & touch drag optimization.
- Firestore dynamic imports rely on network ESM fetch each load (could be optimized via bundling or import map).
- No unit tests or automated regression tests.
- Error handling mostly via alert()/console rather than structured UI components.
- Accessibility: keyboard navigation for drag/drop and block management limited.

## 12. Future Enhancements (Ideas / Backlog)
- Recurring blocks (weekly templates auto-instantiated each new week).
- Time conflict detection & visual overlap resolution (stacking or warnings).
- Calendar export (ICS) or external calendar sync (Google Calendar API).
- Color palette management & theming (dark/light toggle beyond current fixed theme).
- Advanced reporting (per category, per week trend charts, utilization metrics).
- Multi-device session merge (cloud vs local diff awareness, conflict prompts).
- Offline-first improvements (queue cloud writes, detect connectivity).
- Role-based sharing / read-only share links.
- Block search/filter panel (by tag or name).
- Keyboard shortcuts (create block, navigate weeks, open report, focus grid).
- PWA packaging (manifest + service worker for offline cache).
- Replace polling live-reload stub with proper dev tooling or Vite-like environment if build step adopted.

## 13. Security & Privacy Considerations
- All user data currently stored under a single Firestore document per user—simple model, but watch document size growth.
- No encryption at rest beyond Firestore defaults; sensitive personal info should not be stored (communicate to users if public).
- Potential rate limiting not implemented; Firestore writes rely on user behavior and debounce only.

## 14. Deployment
- Static hosting (GitHub Pages) serving `index.html`, `app.js`, `styles.css`.
- Firebase config embedded client-side (standard for public web apps); API key treated as an identifier, not secret.
- Manual deploy via git push to `main` (Pages auto-build).

## 15. Open Issues / Immediate Remediation Tasks
| Issue | Impact | Proposed Action |
|-------|--------|-----------------|
| Signup failing (API_KEY_INVALID) | Blocks cloud auth/sync for new users | Recreate Web app, verify apiKey/appId match, remove temporary restrictions, retest |
| Month view toggle not feature-complete | Confusing UX | Hide or complete month board implementation |
| Missing tests | Risk of regressions | Add minimal unit tests for state serialization & cloud save/load wrappers |
| Large monolithic `app.js` | Hard to maintain | Incremental modularization (split reporting, drag logic, persistence) |

## 16. Glossary
- Template / Created Block: Reusable definition of a block (name, duration, color).
- Scheduled Block: An instance placed on a calendar surface with time & day context.
- Slot: 30‑minute interval unit for positioning within a day surface.
- Week Offset: Integer representing navigation relative to current week (0 = current, +1 next, -1 previous).

---
**Document Version:** 1.0  
**Last Updated:** (auto-generated at creation time)

---

## 17. Functional Requirements (FR)
| ID | Requirement | Priority | Acceptance Summary |
|----|-------------|----------|--------------------|
| FR1 | User can create a block template specifying name, color, duration. | High | Template appears in list and persists locally after save. |
| FR2 | User can drag a template onto a weekly surface to schedule it. | High | Block renders in correct day/time slot with correct height. |
| FR3 | User can move a scheduled block to a different day/time via drag. | High | Position updates and persists after auto-save. |
| FR4 | User can delete a template or scheduled block via trash drop zone. | High | Block removed from state arrays; local save triggered. |
| FR5 | Local persistence: Save, Load, Clear operations affect full planner state. | High | After refresh, Load restores last saved state. |
| FR6 | Auto-save triggers on structural mutations (create/delete/schedule). | High | State in localStorage reflects changes within 1s (immediate now). |
| FR7 | Authenticated user can manually Save to Cloud. | High | Firestore document updated (merge). |
| FR8 | Authenticated user can Load from Cloud. | High | Local state replaced by remote snapshot. |
| FR9 | Cloud auto-sync occurs after local save with debounce. | Medium | Within ~1.5s of change while signed in, Firestore snapshot updates. |
| FR10 | User can sign up (email/password). | High | New account created; UI transitions to logged‑in state. |
| FR11 | User can log in (email/password). | High | Successful login updates status and enables cloud buttons. |
| FR12 | User can log out. | High | Status resets; cloud buttons disabled. |
| FR13 | Reporting overlay shows aggregated hours per block name (week view). | Medium | Opening overlay displays totals consistent with scheduled data. |
| FR14 | Reporting overlay month navigation adjusts aggregation period. | Medium | Prev/Next changes month label and recalculated totals. |
| FR15 | Week selection (W1–W4) filters month overlay to that week. | Low | Aggregates reflect only selected week’s scheduled blocks. |
| FR16 | System prevents cloud save/load when user not authenticated. | High | Buttons disabled or status message shown. |
| FR17 | Drag ghost shows label during drag operations. | Low | Visible ghost follows cursor. |
| FR18 | Debounced cloud sync does not spam writes (>=1.5s separation). | Medium | Rapid consecutive edits produce ≤1 write per debounce window. |
| FR19 | Firestore rules restrict user data access to owner UID only. | High | Unauthorized access attempts fail (rule simulation). |
| FR20 | Month/week navigation updates header range text. | Medium | UI header reflects current week or month interval. |
| FR21 | User can drag a scheduled block onto a list icon to create/save a template. | Medium | Dropped block appears in template (or saved list) and persists after reload. |

## 18. Non-Functional Requirements (NFR)
| ID | Category | Requirement | Metric / Target |
|----|----------|-------------|-----------------|
| NFR1 | Performance | Planner initial render under typical dataset (<150 blocks) | < 500ms on mid-range laptop (informal). |
| NFR2 | Performance | Cloud save debounce prevents >1 write /1.5s | Observed in logs. |
| NFR3 | Reliability | Local save cannot throw uncaught exceptions | No console errors in normal flows. |
| NFR4 | Usability | Core drag actions discoverable without tutorial | User can drag within 30s (observational). |
| NFR5 | Portability | Runs on static hosting without build step | All assets load via relative paths + CDN. |
| NFR6 | Security | Firestore rules protect cross-user access | Rules test denies mismatched UID. |
| NFR7 | Accessibility | Basic ARIA roles for dynamic regions | Live region & labeled buttons present. |
| NFR8 | Maintainability | Single-file monolith flagged for refactor | Roadmap section present; planned modular splits. |
| NFR9 | Resilience | Failures in cloud write do not block local operations | Errors logged; UI continues. |
| NFR10 | Observability | Console diagnostics for major operations | Save/load/auth log lines present when DEBUG or errors. |

## 19. User Stories (US)
| ID | As a | I want to | So that |
|----|-------|-----------|---------|
| US1 | Planner user | Create reusable blocks | Avoid retyping recurring activities. |
| US2 | Planner user | Place blocks on a weekly calendar | Visualize my planned time distribution. |
| US3 | Planner user | Adjust timing via drag & drop | Quickly reschedule without forms. |
| US4 | Planner user | Remove blocks by dragging to trash | Clean up obsolete plans easily. |
| US5 | Returning user | Load previous plan from local storage | Continue where I left off. |
| US6 | Authenticated user | Persist plan in the cloud | Access it across devices. |
| US7 | Authenticated user | Automatically sync changes | Avoid manual save steps. |
| US8 | Analyst user | View aggregated time usage | Understand allocation patterns. |
| US9 | New user | Sign up with email/password | Begin using cloud sync. |
| US10 | Existing user | Login securely | Access my saved plans. |
| US11 | Privacy-conscious user | Log out | Protect my data on shared machines. |
| US12 | Power user | Filter reporting by week | Focus analysis on narrower periods. |

## 20. Acceptance Criteria (Selected Mapping)
| Story/FR | Criteria |
|----------|---------|
| FR1 / US1 | After creating a block: appears in template list with correct color/duration; persists after page reload (local save). |
| FR2 / US2 | Dragging a template into week creates a scheduled block whose start time slot corresponds to drop coordinate (±1 slot tolerance). |
| FR3 / US3 | Moving a scheduled block updates its internal dayIndex/startSlot; reload retains new position. |
| FR5 / US5 | Save → Clear (local) → Load restores identical serialized arrays (deep-equality ignoring order of unscheduled arrays). |
| FR7 / US6 | Cloud Save writes doc with updatedAt; Firestore console shows timestamp within 5s. |
| FR9 / US7 | Multiple rapid drags (≤5s) produce ≤4 writes (given 1.5s debounce). |
| FR13 / US8 | Report overlay totals equal sum(durationMinutes)/60 of visible scheduled blocks (rounded to 2 decimals). |
| FR10 / US9 | Successful signup hides auth forms and enables cloud buttons. |
| FR11 / US10 | Login sets status text to user email/uid and enables cloud buttons. |
| FR12 / US11 | Logout disables cloud buttons and shows auth forms again. |
| FR15 / US12 | Selecting W2 sets overlay label Week 2 and aggregates only blocks whose dates fall in that week window. |
| FR16 | When logged out, clicking Save Cloud shows status "Sign in to save to cloud" and does not call Firestore API. |
| FR19 | Attempt to read another UID path via client (spoof) fails with permission denied (rule simulation). |

## 21. Success Metrics / KPIs
| Metric | Definition | Target (Initial) |
|--------|------------|------------------|
| Engagement | Blocks created per active session | >5 median |
| Retention (local) | % of users returning with restorable state within 7 days | 40% (baseline) |
| Cloud adoption | % authenticated sessions among total sessions | 25% (initial) |
| Sync reliability | Successful cloud saves / attempted saves | >95% |
| Planning density | Scheduled blocks / created templates ratio | >1.2 (indicates actual scheduling, not hoarding) |
| Error rate | Console errors per session (non-network) | <0.2 |

## 22. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|-----------|
| API key misconfiguration | Blocks auth & cloud sync | Recreate web app + stricter config validation UI banner. |
| Monolithic codebase | Slows future features | Progressive modular extraction (reporting, persistence, dnd). |
| Lack of tests | Regression risk | Introduce unit tests for persistence and aggregation early. |
| Single Firestore doc growth | Performance / cost | Introduce pruning or weekly archival documents. |
| No mobile optimization | Reduced adoption | Add responsive layout + touch gestures phase 2. |
| Alert-based errors | Poor UX | Replace with inline toast / status bar component. |

## 23. Roadmap (High-Level)
| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 0 (Now) | Auth fix | Working signup/login (resolve API_KEY_INVALID) |
| 1 | Stability & Tests | Unit tests, API config validation, modular refactor start |
| 2 | UX Enhancements | Responsive layout, improved drag handles, inline notifications |
| 3 | Power Features | Recurring blocks, conflict detection, advanced reporting |
| 4 | Distribution | PWA packaging, performance tuning, optional build tooling |

## 24. Traceability Matrix (Excerpt)
| FR | User Story | Section(s) | Notes |
|----|------------|-----------|-------|
| FR1 | US1 | 6.2, 20 | Creation flow validated locally |
| FR2 | US2 | 6.1, 20 | Drag scheduling core |
| FR5 | US5 | 6.5, 20 | Local persistence stable |
| FR7 | US6 | 6.6, 20 | Cloud save gated by auth |
| FR10 | US9 | 6.7, 20 | Blocked by API key issue |
| FR13 | US8 | 6.8, 20 | Aggregation correctness needed |

## 25. Pending Validation Tasks
| Task | Blocker | Needed For |
|------|---------|------------|
| Resolve API_KEY_INVALID | Config mismatch | Close FR10/FR11 full acceptance |
| Simulate Firestore rule denial | Test harness missing | FR19 verification |
| Measure initial render time | No perf logging yet | NFR1 evidence |

---
**End of Extended Specification**

## 26. UI Layout & Visual Specification

### 26.1 Global Layout Structure
Overall Composition:
- Two primary horizontal regions:
  1. Left Sidebar (rail + active panel)
  2. Main Planner Area (header + calendar grid + overlays + footer)

Sidebar Width:
- Target 300px (adaptive). Constraints: min 280px, max 340px (future responsive logic may clamp with media queries).
- Rail (icon strip) fixed ~56px; panel occupies remaining sidebar width.

Main Planner:
- Flexible width (fills remaining space using flex: 1 1 auto). Uses internal layout:
  - Top Header Bar (navigation, view switch, reporting trigger, optional sync state)
  - Planner Grid Wrapper
  - Overlays (reporting, dialogs) absolutely positioned with high z-index
  - Footer / Status (auth controls + persistence status region)

Stacking / Z-Index Guidelines:
- Base content (grid / sidebar): 0–10
- Floating drag ghost: 2000 (pointer-events: none)
- Overlays (report/reporting): 1000 backdrop, 1010 content container
- Temporary toasts (future): 1500

Scrolling Behavior:
- Body uses height: 100vh. Sidebar panel can scroll independently (overflow-y: auto) if content exceeds viewport.
- Day columns may scroll vertically if grid height exceeds viewport (prefer internal scroll within grid wrapper, not body scroll, to keep rail + header visible).
- Horizontal scroll avoided; grid fits; overflow-x hidden.

Responsiveness (Current Phase):
- Desktop-first. Below ~900px width no guaranteed layout fidelity. Future enhancements: collapse panel to drawers or convert rail to bottom bar on narrow screens.

### 26.2 Spatial System & Sizing
- Base spacing unit: 4px increment (4 / 8 / 12 / 16 / 24 / 32).
- Rail icon button: 48–56px square (padding 12–16px around 24px SVG).
- Header height: 56px.
- Footer/auth bar height: 140–160px (flexible given content; can be modularized later).
- Day column min width: 140px (scales with viewport). Gap between columns: 4–8px.
- Time slot height: 24px per 30‑min slot (example) OR derived so that a 1‑hour block ~48px (tunable constant).
- Block minimum display height: 22px (force at least clickable target even for shortest units).

### 26.3 Color System & Tokens
Foundational Palette (dark theme bias):
- Background Root: #121212 (token: --color-bg-root)
- Surface Panel: #1E1E1E (token: --color-surface-panel)
- Surface Elevated (overlays/cards): #232323 (--color-surface-elevated)
- Grid Base: #242424 (--color-surface-grid)
- Divider / Hairline: rgba(255,255,255,0.08) (--color-border-subtle)
- Divider Strong (focus/active outline): rgba(255,255,255,0.18) (--color-border-strong)
- Text Primary: #ECECEC (--color-text-primary)
- Text Muted: #AAAAAA (--color-text-muted)
- Accent (generic fallback): #4F7DF3 (--color-accent)
- Success: #2DBE72 (--color-success)
- Warning: #F2A93B (--color-warning)
- Error: #E4585A (--color-error)
- Overlay Backdrop: rgba(0,0,0,0.55) (--color-backdrop)
- Drop Target Highlight: rgba(255,255,255,0.12) (--color-drop-target)

Block Color Handling:
- Each `BlockTemplate.color` stored in user data. Text inside blocks (future) should verify contrast ratio ≥ 4.5:1 against white; fallback to dark text if fails.
- Optionally compute contrast on render and add class `block--low-contrast` to apply alternative text color.

### 26.4 Typography System
Font Stack: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

Type Scale (px) & Usage:
- 22: Overlay / Report Title (weight 600–700)
- 20: Primary Header (week / month label) (600)
- 18: Section Subheader / Panel Title (600)
- 16: Form labels / Panel group head (500–600)
- 14: Body / Buttons / Metadata (400–500)
- 12: Micro-labels / Hints (400)

Line Heights:
- Headings: 1.25
- Body: 1.4
- Dense metadata rows: 1.2

Weights:
- Regular 400 base text
- Medium 500 emphasis
- Semibold 600 headings & key actions
- Bold 700 reserved for overlays or strong emphasis only

Letter Spacing:
- Normal (0) for most; optional +0.5px for uppercase micro labels.

### 26.5 Iconography
Implementation: Inline SVG with currentColor or explicit stroke referencing var(--rail-icon-color).
Stroke Guidelines:
- stroke-width: 1.6–1.8
- stroke-linecap: round
- stroke-linejoin: round

Existing Icons:
- Create: plus symbol (two perpendicular strokes)
- History/List: angled arrow / play-like path
- Save Template: bookmark outline (FR21)
- Trash: X cross strokes

Planned Icons (placeholders):
- Report: bar chart (three vertical bars of varying heights)
- Sync: circular arrows (two curved arrows forming a loop)
- Settings: gear (8-tooth outline)

States:
- Default: 70–80% opacity / brightness
- Hover: increase brightness to 100% / add subtle background halo (#FFFFFF10)
- Active (selected): persistent background (#FFFFFF12) + left accent bar (2–3px) tinted accent color or block color sample
- Drop Target (trash/list): add class `.is-drop-target` applying background or outline effect

### 26.6 Sidebar Rail
Structure:
- `nav.sidebar-rail` containing vertically stacked `.rail-button` elements.
- Each button: accessible label (title + aria-label), toggles panel or action.

Dimensions:
- Rail width ~56px; icons ~24px
- Spacing between icons: 4–8px vertical margin

States / Interaction:
- `.rail-button.is-active` indicates corresponding panel visible (`aria-pressed="true"`).
- Keyboard: Tab focus ring (outline: 2px solid var(--color-accent) offset 2px) – to be added if not present.
- Drop Target classes: `.is-drop-target` sets outline: 2px dashed rgba(255,255,255,0.3) OR background-color: rgba(255,255,255,0.18).

Accessibility:
- All actionable icons require role="button" (implicit for <button>) and accessible name.
- Provide tooltip via `title`; consider `aria-describedby` for richer help in future.

### 26.7 Sidebar Panels
Panels (`.sidebar__panel`) correspond to rail selections:
- Create Panel: template creation form (name, color swatches, duration chips, quick action buttons [Create Now, Duplicate Last, Add to list]).
- List / History Panel: placeholder for past or aggregated items (currently history markup placeholder used). Future: saved templates, usage logs.

Panel Content Spacing:
- Internal padding: 16–20px.
- Form groups separated by 12–16px vertical space.
- Swatch grid uses gap: 8px.

### 26.8 Top Header Bar
Contents (left → right):
- Week / Month Navigation (Prev, Current label, Next) or unified label component.
- View Toggle (Week / Month) – currently week primary; month incomplete (FR20 / partial).
- Report Button: opens overlay (aggregation UI).
- Storage Status & Cloud Buttons (Save Cloud / Load Cloud) when signed in.
- Auth status indicator may appear in footer rather than header (current implementation); optional migration to header later.

Behavior:
- Navigation updates `weekOffset` and re-renders header range text (FR20).
- View Toggle: applies class to root controlling layout mode (month board placeholder).
- Report Button: spawns overlay with aggregated data (FR13–FR15 coverage). Ensure focus moves into overlay for accessibility; trap focus until closed.

### 26.9 Planner Grid
Day Columns:
- 7 columns (Sun–Sat) with column headers top-aligned.
- Each column internally a flex/relative container with time slots stacked.
- Slots optional background stripes (every hour darker/lighter alternate) using nth-child or CSS gradient.

Time Slots:
- Represent 30‑min increments; height constant (see sizing). Optional border-top per slot with low-opacity divider.

Blocks:
- Absolutely positioned within day column; top computed from slot index * slotHeight.
- Height = durationMinutes / 30 * slotHeight.
- Rounded corners: 4px.
- Optional subtle shadow for lift (rgba(0,0,0,0.25) 0 2px 4px) – if performance acceptable.
- Dragging adds class `is-dragging` → reduce opacity (0.75) and maybe scale(0.98).

### 26.10 Overlays (Reporting / Future Dialogs)
- Centered container width: clamp(600px, 60vw, 960px)
- Border radius: 8px
- Background: --color-surface-elevated
- Backdrop click closes (unless destructive confirm required)
- Scroll inside content if overflow-y > viewport height minus margins.

### 26.11 Interaction States & Feedback
Hover: Use subtle background for interactive elements; DO NOT shift layout.
Active (mouse down): Slight darken background or inset shadow for buttons.
Focus: Visible 2px outline with adequate contrast (WCAG). Use CSS variable (--focus-ring: 2px solid var(--color-accent)).
Disabled: Reduce opacity to 50%, remove pointer events.
Status Messages: Display in `#storage-status` region; color-coded (success/warning/error) using semantic tokens.

### 26.12 Drag & Drop Visuals
Drag Ghost: Minimal card replicating block color + name (if included). Box-shadow to differentiate from grid.
Drop Zones:
- Trash & List Template Save icons: highlight with `.is-drop-target` style.
- Potential future week edges or overlay import areas (not yet implemented).

### 26.13 Suggested CSS Variable Inventory
Root Variables:
```css
:root {
  --color-bg-root:#121212;
  --color-surface-panel:#1E1E1E;
  --color-surface-grid:#242424;
  --color-surface-elevated:#232323;
  --color-border-subtle:rgba(255,255,255,0.08);
  --color-border-strong:rgba(255,255,255,0.18);
  --color-text-primary:#ECECEC;
  --color-text-muted:#AAAAAA;
  --color-accent:#4F7DF3;
  --color-success:#2DBE72;
  --color-warning:#F2A93B;
  --color-error:#E4585A;
  --color-backdrop:rgba(0,0,0,0.55);
  --color-drop-target:rgba(255,255,255,0.12);
  --focus-ring: 0 0 0 2px var(--color-accent);
  --slot-height:24px; /* 30-min slot height */
}
```

### 26.14 Accessibility Guidelines
- Color contrast: target ≥ 4.5:1 for text; for large headings (≥18px semi-bold) ≥ 3:1 acceptable.
- Keyboard navigation: All rail buttons, form inputs, overlay close actions focusable sequentially. Provide ESC key to close overlays.
- Live Region: `#storage-status` uses aria-live="polite" to announce save/load status.
- Drag & drop fallback: Provide alternative (future) context menu actions for keyboard-only users.

### 26.15 Future Enhancements (UI Layer)
- Theming (light mode, high contrast) via swapping root variable sets.
- Responsive collapse: convert sidebar to icon-only rail with expandable drawer (< 900px width).
- Animated transitions: micro-fade for block appearance / reposition (use CSS transform not top/left for smoother GPU-accelerated movement).
- Skeleton loading states when fetching cloud data.

---
**End UI Layout & Visual Specification (v1)**
