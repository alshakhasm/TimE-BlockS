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
