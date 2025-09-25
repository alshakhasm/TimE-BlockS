# TimE BlockS – Initial Test Plan

## 1. Scope
This plan defines the initial testing approach for the core planner features, persistence layers (local + Firestore), authentication, and reporting overlay. It emphasizes incremental automation while giving immediate manual validation steps for critical flows.

In-Scope (Phase 0/1):
- Block template CRUD (create, delete via trash)
- Scheduling (drag & drop placement, movement)
- Local storage save/load/clear
- Cloud save/load and debounce behavior (after auth is fixed)
- Authentication (signup/login/logout) *pending API key fix*
- Reporting overlay aggregation correctness

Out-of-Scope (Early Phases):
- Mobile/touch gesture fidelity
- Performance benchmarking automation
- Accessibility full audit
- Offline / conflict resolution

## 2. Test Strategy
| Layer | Approach | Tooling (Proposed) |
|-------|---------|--------------------|
| Unit (Pure functions extracted later) | Start by isolating serialization, aggregation helpers. | Jest (lightweight config) |
| Integration (DOM + logic) | JSDOM-based tests for state save/load; minimal mocking for localStorage. | Jest + JSDOM |
| E2E (later) | Simulate user drag/drop & auth flows in real browser. | Playwright (future phase) |
| Manual Critical Path | Quick checklist per commit (outlined below). | Manual |

Rationale: Begin with low-friction Jest setup to validate emerging modular utilities (will extract from `app.js`). Defer full E2E until auth stabilized.

## 3. Test Environments
| Env | Purpose | Notes |
|-----|---------|-------|
| Local (Static) | Fast iteration | `python3 -m http.server` or GitHub Pages |
| GitHub Pages | Public smoke | Manual regression on main |
| (Future) CI Node | Run unit/integration tests headless | Node 18+ |

## 4. Risks & Assumptions
- Auth currently blocked by API key misconfiguration (cloud tests provisional).
- Monolithic `app.js` complicates unit isolation (will refactor into modules: `persistence.js`, `reporting.js`, `drag.js`).
- Drag & drop testing in JSDOM is limited; will abstract block placement logic to test pure computations.

## 5. Test Data
- Synthetic block templates (e.g., Work, Study, Gym) with distinct colors and durations (30–240 min).
- Edge durations: 30 (min slot), 240 (long block), invalid negative (rejected logic once validation added).
- Dates: Use current week; for cloud tests anchor one block with explicit ISO date.

## 6. Manual Regression Checklist (Condensed)
| Area | Step | Expected |
|------|------|----------|
| Templates | Create template A | Appears in list with color & duration |
| Templates | Drag template A to Monday 09:00 | Scheduled block renders 09:00 slot |
| Scheduling | Drag scheduled block to Tuesday 10:30 | Position updates & persists after reload |
| Persistence Local | Click Save Local; reload; Load Local | State restored |
| Persistence Local | Clear Local then Load | Empty (until Load) then restored |
| Auth | Signup test user | Status shows logged in (after fix) |
| Cloud | Save Cloud then modify locally then Load Cloud | Cloud snapshot re-applies prior state |
| Reporting | Open Report overlay | Aggregated hours reflect scheduled blocks |
| Reporting | Switch month (no data) | Overlay handles empty gracefully |
| Delete | Drag scheduled block to trash | Removed and local storage updated |

## 7. Functional Test Matrix (Initial)
| FR | Test Type | Case ID | Brief |
|----|-----------|---------|-------|
| FR1 | Manual / Future Unit | TC-FR1-Create | Create template persists |
| FR2 | Manual | TC-FR2-Schedule | Drag scheduling correct slot |
| FR3 | Manual | TC-FR3-Move | Move block updates slot/day |
| FR5 | Integration | TC-FR5-LocalRoundtrip | Save/Load roundtrip deep equals |
| FR6 | Integration | TC-FR6-AutoSave | Mutation triggers storage update |
| FR7 | Manual (deferred) | TC-FR7-CloudSave | Firestore doc merge |
| FR9 | Manual Observation | TC-FR9-Debounce | Count writes over rapid edits |
| FR13 | Integration | TC-FR13-Aggregate | Aggregation hours correctness |
| FR16 | Integration | TC-FR16-AuthGate | Cloud buttons disabled logged out |

## 8. Sample Automated Test Focus (Future Extraction)
Planned helper modules:
- `stateSerializer` – produce & parse snapshot
- `aggregation` – compute hours by block name & period
- `cloudSync` – wrapper around Firestore calls (mockable)

## 9. Defect Severity Classification
| Severity | Description | Example |
|----------|-------------|---------|
| Critical | Data loss or planner unusable | Cannot load saved state |
| High | Major feature broken | Drag scheduling fails intermittently |
| Medium | Minor incorrect behavior | Aggregation rounding off by >0.25h |
| Low | Cosmetic / polish | Ghost misaligned by few px |

## 10. Exit Criteria (Phase 1)
- Core matrix cases FR1–FR6, FR13, FR16 have passing automated or manually logged outcomes.
- No Critical/High open defects in planner core.
- Auth path validated end-to-end (signup → cloud save → load) once API fixed.

## 11. Initial Automated Test Skeletons
See `tests/aggregation.test.js` (example) for structure.

## 12. Future Enhancements to Test Plan
- Add performance timing harness (measure initial render). 
- CI integration (GitHub Actions) with Jest summary badge.
- Visual regression snapshots (Playwright) for planner grid.
- Accessibility audit (axe-core) integration.

---
**Version:** 0.1 (Initial Draft)
**Owner:** TBD
**Last Updated:** (auto-generated)
