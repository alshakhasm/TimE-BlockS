/*
 * Renders a interactive concept of the TimE BlockS planner with
 * collapsible sidebar, palette, weekly board, and budget summary.
 */

const appRoot = document.querySelector('#app');
const headerRange = document.querySelector('#header-range');
const STORAGE_KEY = 'timeBlocksState';

if (!appRoot) {
  throw new Error('Missing app root container.');
}

function formatDurationLabel(minutes) {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${hours.toFixed(1)}h`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char] || char);
}

function getISOWeekNumber(date) {
  const workingDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = workingDate.getUTCDay() || 7;
  workingDate.setUTCDate(workingDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(workingDate.getUTCFullYear(), 0, 1));
  const diff = workingDate - yearStart;
  return Math.ceil((diff / 86400000 + 1) / 7);
}

const HOURS_VIEW_START = 5;
const HOURS_VIEW_END = 23;
const SLOTS_PER_HOUR = 2; // 30 minute slots

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const durationOptions = [30, 60, 90, 120, 150, 180, 210, 240];

const activities = [
  { id: 'cook', name: 'Cooking', color: 'hsl(35, 95%, 55%)', quota: 8, actual: 10 },
  { id: 'train', name: 'Strength', color: 'hsl(210, 92%, 62%)', quota: 5, actual: 4.5 },
  { id: 'read', name: 'Reading', color: 'hsl(265, 85%, 70%)', quota: 6, actual: 3.5 },
  { id: 'deep', name: 'Deep Work', color: 'hsl(150, 70%, 45%)', quota: 20, actual: 18 },
  { id: 'play', name: 'Play', color: 'hsl(0, 82%, 68%)', quota: 4, actual: 5.5 }
];

const activityMap = new Map(activities.map((item) => [item.id, item]));

const sampleBlocks = [];

const quotaStatus = activities.map((activity) => {
  const diff = activity.actual - activity.quota;
  const percentage = Math.min(100, (activity.actual / activity.quota) * 100);
  return {
    ...activity,
    diff,
    percentage: Number.isFinite(percentage) ? percentage : 0,
    over: diff > 0
  };
});

const rangeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

const boardDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

// Minimal report overlay: created on demand
function buildReportOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'report-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:12px;';
  // enforce dark theme inline to avoid stylesheet caching or specificity issues
  overlay.style.background = '#111827';
  overlay.style.color = '#ffffff';
  overlay.style.fontFamily = 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;justify-content:space-between;';
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:12px;';
  const back = document.createElement('button');
  back.textContent = '← Back';
  back.type = 'button';
  back.addEventListener('click', () => overlay.remove());
  const title = document.createElement('h2');
  title.textContent = 'Time Blocks Report';
  left.appendChild(back);
  left.appendChild(title);
  // date navigator (prev / range / next)
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:8px;';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'nav-button';
  prevBtn.textContent = '◀';
  const rangeLabel = document.createElement('div');
  rangeLabel.id = 'report-range';
  rangeLabel.style.cssText = 'min-width:160px;text-align:center;font-weight:700;color:var(--ink);';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'nav-button';
  nextBtn.textContent = '▶';
  nav.appendChild(prevBtn);
  nav.appendChild(rangeLabel);
  nav.appendChild(nextBtn);
  // week selector (Week 1..4) — appears to the right of the month navigator
  const weekSelector = document.createElement('div');
  weekSelector.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:12px';
  weekSelector.id = 'report-week-selector';
  for (let i = 0; i < 4; i += 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'report-week-btn';
    b.dataset.weekIndex = String(i);
    b.textContent = `W${i + 1}`;
    b.style.cssText = 'padding:6px 8px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.04);color:var(--ink-muted);cursor:pointer';
    weekSelector.appendChild(b);
  }
  // allow deselecting by clicking the active button again
  nav.appendChild(weekSelector);
  // attach navigator into left area so it's near title
  left.appendChild(nav);
  header.appendChild(left);
  // header assembled; navigator and week-selector already appended above
  overlay.appendChild(header);
  const content = document.createElement('div');
  content.id = 'report-overlay-content';
  content.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  overlay.appendChild(content);
  // no Week/Month tabs — overlay operates in month mode by default
  overlay.dataset.reportView = 'month';
  return overlay;
}

// after overlay is added to DOM, wire its nav buttons (use capture by event delegation)
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  const prev = overlay.querySelector('.nav-button:first-of-type');
  const next = overlay.querySelector('.nav-button:last-of-type');
  if (!prev || !next) return;
  if (e.target === prev) {
    overlay.dataset.offset = String(Number(overlay.dataset.offset || 0) - 1);
    // clear any selected week when changing month
    delete overlay.dataset.selectedWeek;
    renderReportOverlay();
  }
  if (e.target === next) {
    overlay.dataset.offset = String(Number(overlay.dataset.offset || 0) + 1);
    // clear any selected week when changing month
    delete overlay.dataset.selectedWeek;
    renderReportOverlay();
  }
});

function renderReportOverlay() {
  const content = document.getElementById('report-overlay-content');
  if (!content) return;
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  // overlay may carry a dataset.offset (in months) for the report navigator
  const offset = Number(overlay.dataset.offset || 0);
  const view = (document.getElementById('report-overlay') || {}).dataset?.reportView || 'week';
  const rangeLabel = document.getElementById('report-range');
  // compute a start/end range based on navigator and report view
  let rangeStart = null;
  let rangeEnd = null;
  const base = new Date();
  if (view === 'month') {
    const monthView = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    // default month start/end
    const monthStart = new Date(monthView.getFullYear(), monthView.getMonth(), 1);
    const monthEnd = new Date(monthView.getFullYear(), monthView.getMonth() + 1, 0); // last day
    // check if a specific week within the month is selected
    const selectedWeek = typeof overlay.dataset.selectedWeek !== 'undefined' ? Number(overlay.dataset.selectedWeek) : null;
    if (selectedWeek === null || Number.isNaN(selectedWeek)) {
      rangeStart = monthStart;
      rangeEnd = monthEnd;
      if (rangeLabel) rangeLabel.textContent = monthView.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else {
      // compute month grid start using same logic as month view to ensure weeks align
      const startDate = computeMonthStartDate(monthView.getFullYear(), monthView.getMonth());
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + selectedWeek * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      rangeStart = weekStart;
      rangeEnd = weekEnd;
      if (rangeLabel) rangeLabel.textContent = `Week ${selectedWeek + 1}: ${rangeFormatter.format(rangeStart)} – ${rangeFormatter.format(rangeEnd)}`;
    }
  } else {
    // week view: offset interpreted in weeks relative to current week
    const ctx = computeWeekContext(offset);
    rangeStart = new Date(ctx.start);
    rangeEnd = new Date(ctx.end);
    if (rangeLabel) rangeLabel.textContent = `${rangeFormatter.format(rangeStart)} – ${rangeFormatter.format(rangeEnd)}`;
  }

  const scheduledAll = Array.isArray(scheduledBlocks) ? scheduledBlocks : [];
  const createdAll = Array.isArray(createdBlocks) ? createdBlocks : [];
  // filter scheduled to the selected navigator range (only absolute-dated blocks)
  const scheduled = scheduledAll.filter((b) => {
    if (!b || !b.date) return false;
    const d = new Date(b.date + 'T00:00:00');
    const rs = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const re = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    return d >= rs && d <= re;
  });
  const created = createdAll; // keep templates available if needed elsewhere, but aggregates use scheduled only below
  // Prepare aggregated stats from scheduled and created/template blocks
  const aggregates = {};
  scheduled.forEach((b) => {
    const name = b.name || 'Untitled';
    const hours = typeof b.durationHours === 'number' ? b.durationHours : (b.durationMinutes ? b.durationMinutes / 60 : 0);
    aggregates[name] = (aggregates[name] || 0) + Number(hours || 0);
  });
  created.forEach((c) => {
    const name = c.name || 'Untitled';
    const hours = Number.isFinite(Number(c.duration)) ? Number(c.duration) / 60 : 0;
    aggregates[name] = (aggregates[name] || 0) + Number(hours || 0);
  });

  // find max for bar scaling
  const maxHours = Object.values(aggregates).reduce((m, v) => Math.max(m, Number(v || 0)), 0) || 1;

  if (view === 'week') {
    // week view: show aggregated totals first, then prefer scheduled blocks; if none, show created/template blocks
    // build aggregate rows (totals) so both week and month show totals
    const aggRowsForWeek = Object.keys(aggregates).sort((a,b) => aggregates[b] - aggregates[a]).map((name) => {
      const hours = Number(aggregates[name] || 0);
  const pct = Math.max(4, Math.round((hours / maxHours) * 100 * 0.3));
      const colorSource = scheduled.find((s) => s.name === name) || created.find((c) => c.name === name) || {};
      const color = colorSource.color || 'var(--accent,#6366F1)';
      return `
        <div class="report-bar-row" style="display:flex;align-items:center;gap:12px;padding:8px 0">
          <div class="report-block" style="background:${color};color:#fff;padding:8px 14px;border-radius:8px;min-width:96px;text-align:center;font-weight:700">${escapeHtml(name)}</div>
          <div style="flex:1;display:flex;align-items:center;gap:12px">
            <div class="report-agg-bar" style="flex:1;background:rgba(255,255,255,0.06);height:36px;border-radius:8px;position:relative;overflow:hidden">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${color};display:flex;align-items:center;justify-content:center;color: #fff;font-weight:700">${hours.toFixed(2)}h</div>
            </div>
            <div style="width:52px;text-align:right;font-weight:700">${hours.toFixed(2)}h</div>
          </div>
        </div>
      `;
    }).join('');

    if (scheduled.length > 0) {
      const rows = scheduled.slice().sort((a,b) => (a.dayIndex - b.dayIndex) || (a.startSlot - b.startSlot)).map((b) => {
        const hours = typeof b.durationHours === 'number' ? Number(b.durationHours) : (b.durationMinutes ? b.durationMinutes / 60 : 0);
        const pct = Math.round((hours / maxHours) * 100);
        const colorSource = b || created.find((c) => c.name === b.name) || {};
        const color = colorSource.color || 'var(--accent,#6366F1)';
        return `
          <div class="report-bar-row">
            <div style="display:flex;align-items:center;gap:12px;width:100%">
              <div class="report-block" style="background:${color};color:#fff;padding:6px 10px;border-radius:6px;min-width:96px;text-align:center;font-weight:600">${escapeHtml(b.name)}</div>
              <div style="flex:1">
                <div class="report-bar__meta"><strong>${escapeHtml(b.name)}</strong><div class="report-bar__sub">${typeof b.dayIndex === 'number' ? days[b.dayIndex] : '-'} • ${typeof b.startHour === 'number' ? formatTimeOfDay(b.startHour) : '-'} • ${hours.toFixed(2)}h</div></div>
                <div class="report-bar"><div class="report-bar__fill" style="width:${pct}%">${hours.toFixed(2)}h</div></div>
              </div>
            </div>
          </div>
        `;
      });
      // For now, only show aggregates to avoid duplicate-looking rows
      content.innerHTML = `<div class="report-aggregates">${aggRowsForWeek}</div>`;
      return;
    }
    if (created.length > 0) {
  const rows = created.map((c) => {
        const hours = Number.isFinite(Number(c.duration)) ? Number(c.duration) / 60 : 0;
        const pct = Math.round((hours / maxHours) * 100);
        const color = c.color || 'var(--accent,#6366F1)';
        return `
          <div class="report-bar-row">
            <div style="display:flex;align-items:center;gap:12px;width:100%">
              <div class="report-block" style="background:${color};color:#fff;padding:6px 10px;border-radius:6px;min-width:96px;text-align:center;font-weight:600">${escapeHtml(c.name)}</div>
              <div style="flex:1">
                <div class="report-bar__meta"><strong>${escapeHtml(c.name)}</strong><div class="report-bar__sub">Template • ${hours.toFixed(2)}h</div></div>
                <div class="report-bar"><div class="report-bar__fill" style="width:${pct}%">${hours.toFixed(2)}h</div></div>
              </div>
            </div>
          </div>
        `;
      });
      // For now, only show aggregates to avoid duplicate-looking rows
      content.innerHTML = `<div class="report-aggregates">${aggRowsForWeek}</div>`;
      return;
    }
    // helpful CTA when no data exists
    content.innerHTML = `
      <div style="padding:16px;color:var(--ink-muted)">
        <p>No scheduled or template blocks found for this week.</p>
        <p>You can create some sample blocks to preview the report.</p>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button id="create-sample-data" type="button">Create sample data</button>
        </div>
      </div>
    `;
    const sampleBtn = document.getElementById('create-sample-data');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        createSampleData();
        renderCreatedBlocks();
        renderScheduledBlocksForWeek();
        renderReportOverlay();
      });
    }
    return;
  }

  // month view: aggregate by block name (sum hours) and render horizontal bars
  const aggRows = Object.keys(aggregates).sort((a,b) => aggregates[b] - aggregates[a]).map((name) => {
    const hours = Number(aggregates[name] || 0);
  const pct = Math.max(4, Math.round((hours / maxHours) * 100 * 0.3));
    const colorSource = scheduled.find((s) => s.name === name) || created.find((c) => c.name === name) || {};
    const color = colorSource.color || 'var(--accent,#6366F1)';
    return `
      <div class="report-bar-row" style="display:flex;align-items:center;gap:12px;padding:8px 0">
        <div class="report-block" style="background:${color};color:#fff;padding:8px 14px;border-radius:8px;min-width:96px;text-align:center;font-weight:700">${escapeHtml(name)}</div>
        <div style="flex:1;display:flex;align-items:center;gap:12px">
          <div class="report-agg-bar" style="flex:1;background:rgba(255,255,255,0.06);height:36px;border-radius:8px;position:relative;overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${color};display:flex;align-items:center;justify-content:center;color: #fff;font-weight:700">${hours.toFixed(2)}h</div>
          </div>
          <div style="width:52px;text-align:right;font-weight:700">${hours.toFixed(2)}h</div>
        </div>
      </div>
    `;
  });
  content.innerHTML = `<div class="report-stats">${aggRows.join('')}</div>`;
}

const reportBtn = document.getElementById('open-report');
if (reportBtn) {
  reportBtn.addEventListener('click', () => {
    let ov = document.getElementById('report-overlay');
    if (!ov) {
      ov = buildReportOverlay();
      document.body.appendChild(ov);
      // wire week selector buttons once when overlay is created
      const weekBtns = ov.querySelectorAll('#report-week-selector .report-week-btn');
      if (weekBtns && weekBtns.length) {
        weekBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            const wk = btn.dataset.weekIndex;
            if (ov.dataset.selectedWeek === wk) {
              delete ov.dataset.selectedWeek;
            } else {
              ov.dataset.selectedWeek = wk;
            }
            // update visual state
            weekBtns.forEach((b) => b.classList.toggle('is-active', ov.dataset.selectedWeek === b.dataset.weekIndex));
            renderReportOverlay();
          });
        });
      }
    }
    renderReportOverlay();
  });
}

let weekOffset = 0;

// Debugging switch: set to `true` to enable on-screen debug logs
const DEBUG = false;

// Debug panel (on-screen) to help trace drag/drop during development (only when DEBUG=true)
const debugPanel = (() => {
  if (!DEBUG) return { log: () => {} };
  try {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = 'position:fixed;right:12px;top:12px;z-index:9999;min-width:220px;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:8px;font-family:monospace;font-size:12px;pointer-events:none;opacity:0.9';
    panel.innerHTML = '<strong>Debug</strong><div id="debug-content" style="margin-top:6px;max-height:220px;overflow:auto;white-space:pre-wrap"></div>';
    document.body.appendChild(panel);
    const content = panel.querySelector('#debug-content');
    return {
      log: (label, data) => {
        try {
          const time = new Date().toLocaleTimeString();
          const entry = document.createElement('div');
          entry.textContent = `${time} — ${label}: ${typeof data === 'string' ? data : JSON.stringify(data)}`;
          content.prepend(entry);
          // keep a few lines
          while (content.children.length > 8) content.removeChild(content.lastChild);
        } catch (e) {
          // ignore
        }
      }
    };
  } catch (e) {
    return { log: () => {} };
  }
})();

// Drag ghost element to visually represent dragging item
const dragGhost = (() => {
  try {
    const el = document.createElement('div');
    el.id = 'drag-ghost';
    el.style.display = 'none';
    el.innerHTML = '<div class="ghost-inner"></div>';
    document.body.appendChild(el);
    const inner = el.querySelector('.ghost-inner');
    return {
      show: (text, x, y) => {
        inner.textContent = text || '';
        el.style.display = 'block';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      },
      move: (x, y) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      },
      hide: () => {
        el.style.display = 'none';
      }
    };
  } catch (e) {
    return { show: () => {}, move: () => {}, hide: () => {} };
  }
})();

// Simple debug helper: only logs when DEBUG is true
function dbg(label, data) {
  if (!DEBUG) return;
  try {
    console.debug(label, data);
  } catch (e) {}
  try {
    debugPanel.log(label, data);
  } catch (e) {}
}

// update ghost position during dragover
document.addEventListener('dragover', (e) => {
  try {
    if (!e) return;
    dragGhost.move(e.clientX + 12, e.clientY + 12);
  } catch (err) {}
});

// Global listeners to help debug drag/drop reachability and dataTransfer types
try {
  document.addEventListener('dragenter', (e) => {
    try {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
      dbg('doc-dragenter', { types });
    } catch (err) {}
  });
  document.addEventListener('dragover', (e) => {
    try {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
      dbg('doc-dragover', { types });
    } catch (err) {}
  });
  document.addEventListener('drop', (e) => {
    try {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
      dbg('doc-drop', { types });
    } catch (err) {}
  });
} catch (e) {
  // ignore if document is not ready
}

// Fallback routing: some browsers don't deliver drop events to deep targets.
// Forward drops to calendar surfaces or trash based on pointer location.
try {
  document.addEventListener('dragover', (e) => {
    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const surface = el.closest && el.closest('.day-column__surface');
      const trash = el.closest && el.closest('#trash-button');
      if (surface || trash) {
        e.preventDefault();
      }
    } catch (err) {}
  }, true);

  document.addEventListener('drop', (e) => {
    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const surface = el.closest && el.closest('.day-column__surface');
      const trash = el.closest && el.closest('#trash-button');

      if (surface) {
        // craft a minimal event object for the handler
        const fakeEvent = {
          currentTarget: surface,
          dataTransfer: e.dataTransfer,
          clientX: e.clientX,
          clientY: e.clientY,
          preventDefault: () => e.preventDefault()
        };
        handleSurfaceDrop(fakeEvent);
        // choose a color from any matching scheduled/created block, fallback to accent
        const colorSource = (scheduled.find((s) => s.name === name) || created.find((c) => c.name === name) || {});
        const color = escapeHtml(colorSource.color || 'var(--accent,#6366F1)');
        return `
          <div class="report-bar-row">
            <div class="report-bar__meta"><strong>${escapeHtml(name)}</strong><div class="report-bar__sub">Total</div></div>
            <div class="report-bar"><div class="report-bar__fill" style="width:${pct}%;background:${color}" aria-hidden="true"></div><div class="report-bar__label">${hours.toFixed(2)}h</div></div>
          </div>
        `;
        let id = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.scheduledId) id = parsed.scheduledId;
          if (parsed && parsed.origin === 'template' && parsed.id) {
            const idxTpl = createdBlocks.findIndex((b) => b.id === parsed.id);
            if (idxTpl !== -1) {
              createdBlocks.splice(idxTpl, 1);
              renderCreatedBlocks();
              saveState();
            }
            return;
          }
        } catch (err) {
          // ignore
        }
        if (!id) return;
        const elToRemove = appRoot.querySelector(`[data-block-id="${id}"]`);
        if (elToRemove) elToRemove.remove();
        const idx = scheduledBlocks.findIndex((b) => b.id === id);
        if (idx !== -1) {
          scheduledBlocks.splice(idx, 1);
          saveState();
        }
      }
    } catch (err) {
      // swallow
    }
  }, true);
} catch (err) {
  // ignore
}

function computeWeekContext(offset = 0) {
  const today = new Date();
  const target = new Date(today);
  target.setDate(today.getDate() + offset * 7);

  const start = new Date(target);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    weekNumber: getISOWeekNumber(target),
    year: target.getFullYear(),
    start,
    end
  };
}

function getWeekDates(context) {
  return Array.from({ length: days.length }, (_, index) => {
    const date = new Date(context.start);
    date.setDate(context.start.getDate() + index);
    return date;
  });
}

function updateHeaderRange() {
  if (!headerRange) {
    return;
  }
  const context = computeWeekContext(weekOffset);
  const startLabel = rangeFormatter.format(context.start);
  const endLabel = rangeFormatter.format(context.end);
  headerRange.textContent = `${context.year} ${startLabel} – ${endLabel}`;
}

const hourRange = HOURS_VIEW_END - HOURS_VIEW_START;
const TOTAL_SLOTS = hourRange * SLOTS_PER_HOUR;

function formatHourLabel(hour) {
  const normalized = hour % 24;
  return `${String(normalized).padStart(2, '0')}00`;
}

function formatTimeOfDay(hour) {
  const base = new Date();
  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  base.setHours(wholeHours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(base);
}

function formatDurationHours(durationHours) {
  const totalMinutes = Math.round(durationHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

const timeTrackMarkup = Array.from({ length: hourRange + 1 }, (_, index) => {
  const hour = HOURS_VIEW_START + index;
  return `<div class="time-label" style="--label-index:${index}">${formatHourLabel(hour)}</div>`;
}).join('');

function timeBlockMarkup(block) {
  const activity = activityMap.get(block.activityId);
  if (!activity) return '';

  const startSlots = (block.start - HOURS_VIEW_START) * SLOTS_PER_HOUR;
  const durationSlots = block.duration * SLOTS_PER_HOUR;
  if (startSlots + durationSlots < 0 || startSlots > hourRange * SLOTS_PER_HOUR) {
    return '';
  }

  const clampedStart = Math.max(0, startSlots);
  const adjustedDuration = Math.min(
    durationSlots + Math.min(0, startSlots),
    hourRange * SLOTS_PER_HOUR - clampedStart
  );

  const overBudget = activity.actual > activity.quota;
  const warningIcon = overBudget ? '<span class="time-block__status">❌</span>' : '';

  return `
    <article class="time-block ${overBudget ? 'time-block--over' : ''}" style="--start:${clampedStart}; --span:${adjustedDuration}; --block-color:${activity.color};">
      <span class="time-block__label">${activity.name}</span>
      <span class="time-block__duration">${block.duration}h</span>
      ${warningIcon}
    </article>
  `;
}

const gridDaysMarkup = days
  .map((day, index) => {
    const isWeekend = false; // no weekend shading
    const blocks = sampleBlocks
      .filter((block) => block.day === index)
      .map((block) => timeBlockMarkup(block))
      .join('');

    return `
      <div class="day-column ${isWeekend ? 'day-column--weekend' : ''}" data-day="${day}">
        <div class="day-column__surface">
          ${blocks}
        </div>
      </div>
    `;
  })
  .join('');

const paletteMarkup = activities.map((activity) => {
  const overBudget = activity.actual > activity.quota;
  return `
    <button class="palette-item ${overBudget ? 'palette-item--over' : ''}" style="--accent-color:${activity.color}" type="button" data-activity="${activity.id}">
      <span class="palette-item__swatch"></span>
      <span class="palette-item__meta">
        <span class="palette-item__name">${activity.name}</span>
        <span class="palette-item__quota">${activity.actual}/${activity.quota} hrs ${overBudget ? '❌' : ''}</span>
      </span>
    </button>
  `;
}).join('');

const durationChipsMarkup = durationOptions
  .map((minutes, index) => `
    <button class="duration-chip ${index === 1 ? 'is-selected' : ''} ${index === 0 ? 'duration-chip--full' : ''}" type="button" data-duration="${minutes}">
      ${formatDurationLabel(minutes)}
    </button>
  `)
  .join('');

const swatchOptions = [
  // Top row: red variations (from warm red to coral)
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EC4899',
  '#EF6A6A',
  // Second row: blues, teals and greys
  '#0EA5E9',
  '#22D3EE',
  '#6366F1',
  '#8B5CF6',
  '#64748B'
];

const colorSwatchMarkup = swatchOptions
  .map(
    (hex, index) => `
      <button class="color-swatch ${index === 0 ? 'is-selected' : ''}" type="button" data-color="${hex}" aria-label="Select color ${hex}">
        <span style="background:${hex}"></span>
      </button>
    `
  )
  .join('');

const blockHistory = [...sampleBlocks].sort((a, b) => {
  if (a.day === b.day) {
    return a.start - b.start;
  }
  return a.day - b.day;
});

const blockHistoryMarkup = blockHistory
  .map((block) => {
    const activity = activityMap.get(block.activityId);
    if (!activity) return '';
    const startLabel = formatTimeOfDay(block.start);
    const endLabel = formatTimeOfDay(block.start + block.duration);
    const durationLabel = formatDurationHours(block.duration);
    const overBudget = activity.actual > activity.quota;

    return `
      <article class="block-history__item ${overBudget ? 'block-history__item--over' : ''}">
        <span class="block-history__time">${days[block.day]} · ${startLabel} – ${endLabel}</span>
        <div class="block-history__meta">
          <span class="block-history__swatch" style="--history-color:${activity.color}"></span>
          <span class="block-history__name">${activity.name}</span>
          <span class="block-history__duration">${durationLabel}</span>
        </div>
      </article>
    `;
  })
  .join('');

const sidebarRailMarkup = `
  <nav class="sidebar-rail" aria-label="Sidebar">
  <button class="rail-button is-active" type="button" data-panel="create" aria-pressed="true" title="Create" style="--rail-icon-color: ${swatchOptions[0] || selectedColor}">
      <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true" role="img">
        <!-- Simple plus sign -->
        <path d="M12 6v12" stroke="var(--rail-icon-color)" stroke-width="1.8" stroke-linecap="round" />
        <path d="M6 12h12" stroke="var(--rail-icon-color)" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
  <button class="rail-button" type="button" data-panel="list" aria-pressed="false" title="History" style="--rail-icon-color: ${swatchOptions[1] || selectedColor}">
      <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6 L16 12 L8 18" stroke="var(--rail-icon-color)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </button>
  <button class="rail-button" type="button" data-action="trash" aria-pressed="false" title="Delete block" id="trash-button" style="--rail-icon-color: ${swatchOptions[2] || selectedColor}">
      <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
        <!-- Simple X (close) icon for trash -->
        <path d="M6 6l12 12" stroke="var(--rail-icon-color)" stroke-width="1.8" stroke-linecap="round" />
        <path d="M18 6L6 18" stroke="var(--rail-icon-color)" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
  </nav>
`;

const sidebarMarkup = `
  <aside class="sidebar" data-state="expanded">
    <div class="sidebar__content">
      <div class="sidebar__panel sidebar__panel--create is-active" data-panel="create">
        <form class="create-form" autocomplete="off">
          <div class="create-form__group">
            <input class="create-form__input" id="task-name" name="task-name" placeholder="e.g. Writing Sprint" type="text" />
          </div>
          <div class="create-form__group">
            <div class="color-swatch-grid">
              ${colorSwatchMarkup}
            </div>
            <div class="create-form__info">
              <div class="block-counter">
                  <!-- counter buttons removed per user request -->
                </div>
            </div>
          </div>
          <div class="create-form__group">
            <span class="create-form__label">Duration</span>
            <div class="duration-chips">
              ${durationChipsMarkup}
            </div>
          </div>
          <button class="create-form__submit" type="button">Create block</button>
          <button id="create-now" class="create-form__submit" type="button" style="margin-top:8px">Create Now</button>
          <button id="duplicate-last" class="create-form__submit create-form__duplicate" type="button" style="margin-top:8px">Duplicate Last</button>
          <button id="add-to-list" class="create-form__submit" type="button" style="margin-top:8px">Add to list</button>
          <div class="create-form__list" id="created-blocks" aria-live="polite"></div>
        </form>
      </div>
      <div class="sidebar__panel sidebar__panel--list" data-panel="list">
        <div class="create-form__list" id="saved-list-blocks" aria-live="polite"></div>
        <div class="block-history">
          ${blockHistoryMarkup || '<p class="block-history__empty">No blocks logged yet.</p>'}
        </div>
      </div>
    </div>
  </aside>
`;

appRoot.innerHTML = `
  <section class="workspace" data-sidebar="expanded">
    ${sidebarRailMarkup}
    ${sidebarMarkup}
    <section class="planner">
      <section class="board">
        <div class="board__heading">
          ${days
            .map(
              (day, index) => `
                <div class="board__day-label">
                  <span class="board__day-name">${day}</span>
                  <span class="board__day-date">${index + 13}</span>
                </div>
              `
            )
            .join('')}
        </div>
        <div class="board__grid">
          <div class="time-track">
            ${timeTrackMarkup}
          </div>
          <div class="grid-days" data-view="week">
            ${gridDaysMarkup}
          </div>
        </div>
      </section>
    </section>
  </section>
`;

const sidebar = appRoot.querySelector('.sidebar');
const workspace = appRoot.querySelector('.workspace');
const sidebarPanels = Array.from(appRoot.querySelectorAll('.sidebar__panel'));
const railButtons = Array.from(appRoot.querySelectorAll('.rail-button'));
const viewButtons = Array.from(document.querySelectorAll('.view-toggle'));
const gridDays = appRoot.querySelector('.grid-days');
const dayColumns = Array.from(appRoot.querySelectorAll('.day-column'));
const daySurfaces = Array.from(appRoot.querySelectorAll('.day-column__surface'));
const boardDayLabels = Array.from(appRoot.querySelectorAll('.board__day-label'));
const boardDayNames = Array.from(appRoot.querySelectorAll('.board__day-name'));
const boardDayDates = Array.from(appRoot.querySelectorAll('.board__day-date'));
const durationChips = Array.from(appRoot.querySelectorAll('.duration-chip'));
const colorSwatches = Array.from(appRoot.querySelectorAll('.color-swatch'));
const navButtons = Array.from(document.querySelectorAll('[data-direction]'));
const nameInput = appRoot.querySelector('#task-name');
// blockCountDisplay removed — we no longer show 'Blocks: N' in the sidebar
const createdBlocksContainer = appRoot.querySelector('#created-blocks');
const createButton = appRoot.querySelector('.create-form__submit');
const createNowButton = appRoot.querySelector('#create-now');
const duplicateLastButton = appRoot.querySelector('#duplicate-last');
const addToListButton = appRoot.querySelector('#add-to-list');
const savedListContainer = appRoot.querySelector('#saved-list-blocks');
// counter buttons removed from markup; keep reference for compatibility (empty array)
const counterButtons = Array.from(appRoot.querySelectorAll('.counter-button')) || [];

// Storage control elements in the footer
const saveButton = document.querySelector('#save-local');
const loadButton = document.querySelector('#load-local');
const clearButton = document.querySelector('#clear-local');
const storageStatus = document.querySelector('#storage-status');

let selectedColor = swatchOptions[0];
let selectedDuration = durationOptions[1] ?? durationOptions[0];
let createdBlocks = [];
let scheduledBlocks = [];
let savedListBlocks = [];

updateHeaderRange();

function renderWeekView() {
  if (!gridDays) {
    return;
  }
  // clear month view artifacts if any
  gridDays.removeAttribute('data-month-start');
  // remove any month-cell nodes that may have been appended into surfaces
  dayColumns.forEach((col) => {
    const surface = col.querySelector('.day-column__surface');
    if (surface) {
      const monthCells = Array.from(surface.querySelectorAll('.month-cell'));
      monthCells.forEach((c) => c.remove());
    }
  });

  const context = computeWeekContext(weekOffset);
  const weekDates = getWeekDates(context);

  gridDays.setAttribute('data-week-start', context.start.toISOString().split('T')[0]);

  boardDayLabels.forEach((label, index) => {
    const date = weekDates[index];
    if (!label || !date) {
      return;
    }

    label.setAttribute('data-date', date.toISOString());

    const nameEl = boardDayNames[index];
    if (nameEl) {
      nameEl.textContent = days[date.getDay()];
    }

    const dateEl = boardDayDates[index];
    if (dateEl) {
      dateEl.textContent = String(date.getDate());
      dateEl.setAttribute('aria-label', boardDateFormatter.format(date));
    }
  });

  dayColumns.forEach((column, index) => {
    const date = weekDates[index];
    if (!column || !date) {
      return;
    }

    column.dataset.day = days[date.getDay()];
    column.dataset.date = date.toISOString().split('T')[0];

    const isWeekend = false; // no weekend shading
    column.classList.toggle('day-column--weekend', isWeekend);
  });
}

function renderScheduledBlocksForWeek() {
  if (!daySurfaces) return;
  // clear existing scheduled elements
  daySurfaces.forEach((surface) => {
    const scheduled = Array.from(surface.querySelectorAll('.time-block--scheduled'));
    scheduled.forEach((el) => el.remove());
  });
  // render from scheduledBlocks array
  if (Array.isArray(scheduledBlocks) && scheduledBlocks.length > 0) {
    const context = computeWeekContext(weekOffset);
    const start = new Date(context.start);
    const end = new Date(context.end);
    end.setHours(23,59,59,999);
    scheduledBlocks.forEach((block) => {
      let targetIndex = -1;
      if (block.date) {
        const d = new Date(block.date + 'T00:00:00');
        if (d >= start && d <= end) {
          const diffMs = d.getTime() - start.getTime();
          targetIndex = Math.floor(diffMs / 86400000);
        }
      } else if (typeof block.dayIndex === 'number') {
        targetIndex = block.dayIndex;
      }
      if (targetIndex >= 0 && targetIndex < daySurfaces.length) {
        const el = buildScheduledBlockElement(block);
        daySurfaces[targetIndex].appendChild(el);
      }
    });
    daySurfaces.forEach((surface) => alignSurfaceBlocks(surface));
  }
}

// Compute the start date for a month view according to rules:
// - Month grid should start on the first Sunday of the month
// - Exception: if the month starts on Monday, show the previous Sunday (start from day -1)
function computeMonthStartDate(year, month) {
  // month is 0-indexed (0 = January)
  const firstOfMonth = new Date(year, month, 1);
  const day = firstOfMonth.getDay(); // 0 = Sunday, 1 = Monday, ...
  // if month starts on Sunday, start there; if starts on Monday, start on previous Sunday
  if (day === 0) return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1);
  if (day === 1) {
    // previous Sunday
    const prev = new Date(firstOfMonth);
    prev.setDate(0); // last day of previous month
    // compute previous Sunday's date: go back to the last Sunday before firstOfMonth
    // simpler: set date to firstOfMonth.getDate() - 1 (which is 0) already handled, but ensure weekday 0
    // We'll compute by subtracting 1 day
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - 1);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate());
  }
  // otherwise find the first Sunday after or on the first
  const delta = (7 - day) % 7; // days to add to get to next Sunday
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() + delta);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate());
}

function renderMonthView() {
  // Render month view as a separate page (hide main workspace planner)
  const plannerEl = document.querySelector('.planner');
  if (plannerEl) plannerEl.style.display = 'none';

  // remove any existing month-page first
  let monthPage = document.querySelector('.month-page');
  if (monthPage) monthPage.remove();

  monthPage = document.createElement('div');
  monthPage.className = 'month-page';

  const now = new Date();
  const viewMonthDate = new Date(now.getFullYear(), now.getMonth() + weekOffset, 1);
  const year = viewMonthDate.getFullYear();
  const month = viewMonthDate.getMonth();
  const startDate = computeMonthStartDate(year, month);

  // month page relies on the main header control bar for the month label

  const monthGrid = document.createElement('div');
  monthGrid.className = 'month-grid';

  // Build 4 week cards (2x2). Each card represents a contiguous week starting at startDate + 7*i
  for (let w = 0; w < 4; w += 1) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const card = document.createElement('section');
    card.className = 'week-card';
    const hdr = document.createElement('header');
    hdr.className = 'week-card__header';
    hdr.textContent = `${rangeFormatter.format(weekStart)} — ${rangeFormatter.format(weekEnd)}`;
    card.appendChild(hdr);

    const weekRow = document.createElement('div');
    weekRow.className = 'week-card__days';

    for (let d = 0; d < 7; d += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const iso = date.toISOString().split('T')[0];

      const col = document.createElement('div');
      col.className = 'mini-day';
      col.dataset.date = iso;
      col.innerHTML = `<div class="mini-day__label">${days[date.getDay()]}<span class="mini-day__num"> ${date.getDate()}</span></div><div class="mini-day__content"></div>`;

      // append scheduled blocks that match the date
      const content = col.querySelector('.mini-day__content');
      scheduledBlocks.forEach((block) => {
        if (block.date === iso) {
          const el = buildScheduledBlockElement(block);
          el.classList.add('time-block--month');
          content.appendChild(el);
        }
      });

      // allow drops into month mini-day cells
      if (content) {
        content.addEventListener('dragenter', (e) => {
          if (hasBlockPayload(e.dataTransfer)) {
            e.preventDefault();
            content.classList.add('is-drop-target');
          }
        });
        content.addEventListener('dragover', (e) => {
          if (hasBlockPayload(e.dataTransfer)) {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          }
        });
        content.addEventListener('dragleave', () => content.classList.remove('is-drop-target'));
        content.addEventListener('drop', (e) => {
          content.classList.remove('is-drop-target');
          if (!hasBlockPayload(e.dataTransfer)) return;
          e.preventDefault();
          // handle drop onto month cell
          const payload = parseBlockTransfer(e.dataTransfer);
          if (!payload) return;
          // compute duration
          const durationMinutes = Number(payload.durationMinutes);
          if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

          const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
          // find existing scheduled block by id (move)
          if (payload && payload.id) {
            const idx = scheduledBlocks.findIndex((b) => b.id === payload.id);
            if (idx !== -1) {
              const existing = scheduledBlocks[idx];
              existing.date = iso;
              // set dayIndex for week rendering
              existing.dayIndex = new Date(iso + 'T00:00:00').getDay();
              // ensure duration fields
              existing.durationMinutes = durationMinutes;
              existing.durationSlots = durationSlots;
              existing.durationHours = durationSlots / SLOTS_PER_HOUR;
              // leave startSlot unchanged if present; otherwise center it in the day
              if (typeof existing.startSlot !== 'number') {
                const mid = Math.floor(TOTAL_SLOTS / 2 - durationSlots / 2);
                existing.startSlot = Math.max(0, Math.min(mid, TOTAL_SLOTS - durationSlots));
                existing.startHour = HOURS_VIEW_START + existing.startSlot / SLOTS_PER_HOUR;
              }
              saveState();
              // re-render both views
              renderMonthView();
              renderWeekView();
              renderScheduledBlocksForWeek();
              return;
            }
          }

          // otherwise, create a new scheduled block from template payload
          if (!payload.name || String(payload.name).trim() === '') return;
          const scheduledBlock = {
            id: payload.id || `scheduled-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: String(payload.name).trim(),
            color: payload.color || selectedColor,
            durationMinutes,
            durationSlots,
            durationHours: durationSlots / SLOTS_PER_HOUR,
            // center in day
            startSlot: Math.max(0, Math.floor(TOTAL_SLOTS / 2 - durationSlots / 2)),
            startHour: HOURS_VIEW_START + Math.max(0, Math.floor(TOTAL_SLOTS / 2 - durationSlots / 2)) / SLOTS_PER_HOUR,
            dayIndex: new Date(iso + 'T00:00:00').getDay(),
            date: iso
          };
          scheduledBlock.endHour = scheduledBlock.startHour + scheduledBlock.durationHours;
          scheduledBlocks.push(scheduledBlock);
          saveState();
          renderMonthView();
          renderWeekView();
          renderScheduledBlocksForWeek();
        });
      }

      weekRow.appendChild(col);
    }

    card.appendChild(weekRow);
    monthGrid.appendChild(card);
  }

  monthPage.appendChild(monthGrid);
  // place the month page inside the workspace so it aligns with the sidebar
  const workspaceEl = document.querySelector('.workspace');
  if (workspaceEl) {
    workspaceEl.appendChild(monthPage);
  } else {
    appRoot.appendChild(monthPage);
  }
}

renderWeekView();
renderScheduledBlocksForWeek();

function setActiveSidebarTab(targetTab) {
  railButtons.forEach((button) => {
    const isMatch = button.dataset.panel === targetTab;
    button.classList.toggle('is-active', isMatch);
    button.setAttribute('aria-pressed', String(isMatch));
  });

  sidebarPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === targetTab);
  });
}

function setSidebarCollapsed(collapsed) {
  if (!sidebar || !workspace) return;
  sidebar.classList.toggle('is-collapsed', collapsed);
  workspace.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
}

railButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.panel || 'create';
    const isActive = button.classList.contains('is-active');
    const isCollapsed = sidebar?.classList.contains('is-collapsed');

    if (isActive && !isCollapsed) {
      setSidebarCollapsed(true);
      return;
    }

    setSidebarCollapsed(false);
    setActiveSidebarTab(targetTab);
  });
});

setActiveSidebarTab('create');

function setSelectedColor(color) {
  selectedColor = color;
  colorSwatches.forEach((swatch) => {
    const isMatch = swatch.dataset.color === color;
    swatch.classList.toggle('is-selected', isMatch);
  });
  // keep rail icon colors fixed to their assigned swatches (do not override here)
}

colorSwatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    const color = swatch.dataset.color;
    if (!color) return;
    setSelectedColor(color);
  });
});

durationChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    durationChips.forEach((item) => item.classList.remove('is-selected'));
    chip.classList.add('is-selected');
    const minutes = Number(chip.dataset.duration);
    if (!Number.isNaN(minutes)) {
      selectedDuration = minutes;
    }
  });
});

function renderCreatedBlocks() {
  if (!createdBlocksContainer) return;
  if (createdBlocks.length === 0) {
    createdBlocksContainer.innerHTML = '<p class="create-form__empty">No blocks yet.</p>';
    return;
  }

  createdBlocksContainer.innerHTML = createdBlocks
    .map(
      (block) => `
        <article class="create-form__list-item" draggable="true" style="--block-color:${block.color}" data-block-id="${block.id}" data-block-name="${escapeHtml(block.name)}" data-block-color="${block.color}" data-block-duration="${block.duration}" data-block-origin="template">
          <span class="create-form__list-name">${escapeHtml(block.name)}</span>
          <span class="create-form__list-duration">${formatDurationLabel(block.duration)}</span>
        </article>
      `
    )
    .join('');

  // attach drag handlers to created/template items so they can be deleted via trash
  const items = Array.from(createdBlocksContainer.querySelectorAll('.create-form__list-item'));
  items.forEach((item) => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (ev) => {
      const payload = getBlockPayloadFromElement(item);
      if (!payload) return;
      try {
        if (ev.dataTransfer) {
          ev.dataTransfer.setData('application/json', JSON.stringify(payload));
          ev.dataTransfer.setData('text/plain', payload.id || payload.name || '');
          ev.dataTransfer.effectAllowed = 'copy';
        }
        item.classList.add('is-dragging');
      } catch (e) {
        // ignore
      }
    });
    item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
  });
}

function renderSavedListBlocks() {
  if (!savedListContainer) return;
  if (!Array.isArray(savedListBlocks) || savedListBlocks.length === 0) {
    savedListContainer.innerHTML = '<p class="create-form__empty">No saved items.</p>';
    return;
  }

  savedListContainer.innerHTML = savedListBlocks
    .map(
      (block) => `
          <article class="create-form__list-item" draggable="true" style="--block-color:${block.color}" data-block-id="${block.id}" data-block-name="${escapeHtml(block.name)}" data-block-color="${block.color}" data-block-duration="${block.duration}" data-block-origin="saved">
            <button class="saved-item__delete" data-saved-id="${block.id}" aria-label="Delete saved item">✕</button>
            <span class="create-form__list-name">${escapeHtml(block.name)}</span>
            <span class="create-form__list-duration">${formatDurationLabel(block.duration)}</span>
          </article>
        `
    )
    .join('');

  // ensure listeners are attached once for saved list container
  attachSavedListDelegates();
}

function handleSavedListClick(e) {
  const btn = e.target instanceof HTMLElement ? e.target.closest('.saved-item__delete') : null;
  if (!btn) return;
  const id = btn.dataset.savedId;
  if (!id) return;
  const idx = savedListBlocks.findIndex((b) => b.id === id);
  if (idx !== -1) {
    savedListBlocks.splice(idx, 1);
    renderSavedListBlocks();
    saveState();
  }
}

let savedListDelegatesAttached = false;
function attachSavedListDelegates() {
  if (savedListDelegatesAttached || !savedListContainer) return;
  // dragstart: reuse created template handler
  savedListContainer.addEventListener('dragstart', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target.closest('.create-form__list-item') : null;
    if (!target || !savedListContainer.contains(target)) return;
    const payload = getBlockPayloadFromElement(target);
    if (!payload) return;
    try {
      if (ev.dataTransfer) {
        ev.dataTransfer.setData('application/json', JSON.stringify(payload));
        ev.dataTransfer.setData('text/plain', payload.id || payload.name || '');
        ev.dataTransfer.effectAllowed = 'copy';
      }
      try { window.__timeblock_payload = payload; } catch (err) {}
      target.classList.add('is-dragging');
    } catch (e) {}
  });
  savedListContainer.addEventListener('dragend', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target.closest('.create-form__list-item') : null;
    if (target && savedListContainer.contains(target)) {
      target.classList.remove('is-dragging');
      try { window.__timeblock_payload = null; } catch (err) {}
    }
  });
  // delegated click handler for inline delete buttons
  savedListContainer.addEventListener('click', handleSavedListClick);
  savedListDelegatesAttached = true;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.weekOffset === 'number') {
        weekOffset = parsed.weekOffset;
      }
      if (Array.isArray(parsed.createdBlocks)) {
        createdBlocks = parsed.createdBlocks;
      }
      if (Array.isArray(parsed.scheduledBlocks)) {
        scheduledBlocks = parsed.scheduledBlocks;
      }
      if (Array.isArray(parsed.savedListBlocks)) {
        savedListBlocks = parsed.savedListBlocks;
      }
    }
  } catch (error) {
    console.warn('Failed to load saved planner state', error);
  }
}

function saveState() {
  const snapshot = {
    weekOffset,
    createdBlocks,
    scheduledBlocks,
    savedListBlocks
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    if (storageStatus) storageStatus.textContent = 'Saved ✓';
  } catch (error) {
    console.error('Failed to persist planner state', error);
    if (storageStatus) storageStatus.textContent = 'Save failed';
  }
}

loadState();

// Apply loaded week offset to the UI and render
updateHeaderRange();
renderWeekView();
setSelectedColor(selectedColor);
renderCreatedBlocks();
renderSavedListBlocks();

// After initial load, render any scheduled blocks into the surfaces
if (Array.isArray(scheduledBlocks) && scheduledBlocks.length > 0) {
  // remove any existing scheduled elements (from templates)
  daySurfaces.forEach((surface) => {
    const scheduled = Array.from(surface.querySelectorAll('.time-block--scheduled'));
    scheduled.forEach((el) => el.remove());
  });
  scheduledBlocks.forEach((block) => {
    const el = buildScheduledBlockElement(block);
    // prefer anchoring by absolute date if present
    let surface = null;
    if (block.date) {
      surface = daySurfaces.find((s) => s.dataset.date === block.date);
    }
    const dayIdx = typeof block.dayIndex === 'number' ? block.dayIndex : -1;
    if (!surface && dayIdx >= 0) surface = daySurfaces[dayIdx];
    if (surface) surface.appendChild(el);
  });
  // align after adding
  daySurfaces.forEach((surface) => alignSurfaceBlocks(surface));
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    weekOffset = 0;
    createdBlocks = [];
    scheduledBlocks = [];
    savedListBlocks = [];
    renderCreatedBlocks();
    renderSavedListBlocks();
    daySurfaces.forEach((surface) => {
      const scheduled = Array.from(surface.querySelectorAll('.time-block--scheduled'));
      scheduled.forEach((el) => el.remove());
    });
    updateHeaderRange();
    renderWeekView();
    if (storageStatus) storageStatus.textContent = 'Cleared';
  } catch (error) {
    console.error('Failed to clear stored state', error);
    if (storageStatus) storageStatus.textContent = 'Clear failed';
  }
}

// Helper: populate some sample blocks (for debugging/report preview)
function createSampleData() {
  createdBlocks = [
    { id: `tpl-1`, name: 'Running', color: '#10B981', duration: 60 },
    { id: `tpl-2`, name: 'Reading', color: '#6366F1', duration: 90 },
    { id: `tpl-3`, name: 'Coding', color: '#F97316', duration: 120 }
  ];
  const baseDay = 1; // Monday index
  scheduledBlocks = [
    { id: 's1', name: 'Running', color: '#10B981', durationMinutes: 60, durationSlots: 2, durationHours: 1, startSlot: 6, startHour: 8, dayIndex: baseDay },
    { id: 's2', name: 'Reading', color: '#6366F1', durationMinutes: 90, durationSlots: 3, durationHours: 1.5, startSlot: 10, startHour: 10, dayIndex: baseDay + 1 },
    { id: 's3', name: 'Coding', color: '#F97316', durationMinutes: 120, durationSlots: 4, durationHours: 2, startSlot: 14, startHour: 12, dayIndex: baseDay + 2 }
  ];
  scheduleAutoSave();
}

// Wire storage buttons
saveButton?.addEventListener('click', () => {
  saveState();
});

loadButton?.addEventListener('click', () => {
  loadState();
  renderCreatedBlocks();
  renderSavedListBlocks();
  // Re-render scheduled blocks from loaded data
  daySurfaces.forEach((surface) => {
    // remove existing
    const scheduled = Array.from(surface.querySelectorAll('.time-block--scheduled'));
    scheduled.forEach((el) => el.remove());
  });
  scheduledBlocks.forEach((block) => {
    const el = buildScheduledBlockElement(block);
    // prefer anchoring by absolute date if present
    let surface = null;
    if (block.date) {
      surface = daySurfaces.find((s) => s.dataset.date === block.date);
    }
    const dayIdx = typeof block.dayIndex === 'number' ? block.dayIndex : -1;
    if (!surface && dayIdx >= 0) surface = daySurfaces[dayIdx];
    if (surface) surface.appendChild(el);
  });
  // align each surface after re-adding elements
  daySurfaces.forEach((surface) => alignSurfaceBlocks(surface));
  if (storageStatus) storageStatus.textContent = 'Loaded';
});

clearButton?.addEventListener('click', () => {
  clearState();
});

// Trash drop zone for deleting scheduled blocks
const trashButton = document.querySelector('#trash-button');
if (trashButton) {
  trashButton.addEventListener('dragenter', (e) => {
    if (hasBlockPayload(e.dataTransfer)) {
      e.preventDefault();
      trashButton.classList.add('is-drop-target');
    }
  });
  trashButton.addEventListener('dragover', (e) => {
    if (hasBlockPayload(e.dataTransfer)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  });
  trashButton.addEventListener('dragleave', () => {
    trashButton.classList.remove('is-drop-target');
  });
  trashButton.addEventListener('drop', (e) => {
    trashButton.classList.remove('is-drop-target');
    if (!hasBlockPayload(e.dataTransfer)) return;
    e.preventDefault();
    // Try parsing a structured payload first (handles JSON and window fallback)
    const payload = parseBlockTransfer(e.dataTransfer) || (typeof window !== 'undefined' ? window.__timeblock_payload : null);

    // If we have an object-like payload, handle by origin
    if (payload && typeof payload === 'object') {
      // scheduledId alias
      const targetId = payload.scheduledId || payload.id;
      if (payload.origin === 'template' && targetId) {
        const idxTpl = createdBlocks.findIndex((b) => b.id === targetId);
        if (idxTpl !== -1) {
          createdBlocks.splice(idxTpl, 1);
          renderCreatedBlocks();
          saveState();
        }
        trashButton.classList.remove('is-drop-target');
        return;
      }
      if (payload.origin === 'saved' && targetId) {
        const idxSaved = savedListBlocks.findIndex((b) => b.id === targetId);
        if (idxSaved !== -1) {
          savedListBlocks.splice(idxSaved, 1);
          renderSavedListBlocks();
          saveState();
        }
        trashButton.classList.remove('is-drop-target');
        return;
      }
      if (payload.origin === 'scheduled' && targetId) {
        // remove scheduled block by id
        const idxSched = scheduledBlocks.findIndex((b) => b.id === targetId);
        if (idxSched !== -1) {
          scheduledBlocks.splice(idxSched, 1);
          const elSched = document.querySelector(`[data-block-id="${targetId}"]`);
          if (elSched) elSched.remove();
          saveState();
        }
        trashButton.classList.remove('is-drop-target');
        return;
      }
    }

    // fallback: try plain text id from dataTransfer or window payload
    const raw = (e.dataTransfer && (e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain'))) || '';
    let id = raw || (payload && typeof payload === 'string' ? payload : '');
    if (!id && typeof window !== 'undefined' && window.__timeblock_payload && typeof window.__timeblock_payload === 'object') {
      id = window.__timeblock_payload.id || '';
    }
    if (!id) return;

    // remove from saved list or created templates if present
    const idxSavedPlain = savedListBlocks.findIndex((b) => b.id === id);
    if (idxSavedPlain !== -1) {
      savedListBlocks.splice(idxSavedPlain, 1);
      renderSavedListBlocks();
      saveState();
      trashButton.classList.remove('is-drop-target');
      return;
    }
    const idxTplPlain = createdBlocks.findIndex((b) => b.id === id);
    if (idxTplPlain !== -1) {
      createdBlocks.splice(idxTplPlain, 1);
      renderCreatedBlocks();
      saveState();
      trashButton.classList.remove('is-drop-target');
      return;
    }

    // remove from DOM and scheduledBlocks array if scheduled
    const el = document.querySelector(`[data-block-id="${id}"]`);
    if (el) el.remove();
    const idx = scheduledBlocks.findIndex((b) => b.id === id);
    if (idx !== -1) {
      scheduledBlocks.splice(idx, 1);
      saveState();
    }
  });
}

// Auto-save on important changes
const AUTO_SAVE_DEBOUNCE = 0; // 0 = immediate save
let autoSaveTimer = null;
function scheduleAutoSave() {
  if (AUTO_SAVE_DEBOUNCE <= 0) {
    saveState();
    return;
  }
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveState();
  }, AUTO_SAVE_DEBOUNCE);
}

// Hook into mutations that change createdBlocks or scheduledBlocks
const createdBlocksObserver = new MutationObserver(() => scheduleAutoSave());
if (createdBlocksContainer) {
  createdBlocksObserver.observe(createdBlocksContainer, { childList: true, subtree: false });
}

// Drop saves: schedule auto-save on drop (handled inside the drop handler)

function getBlockPayloadFromElement(element) {
  if (!element) {
    return null;
  }
  const duration = Number(element.dataset.blockDuration);
  return {
    id: element.dataset.blockId || '',
    // Return raw name (may be empty) so callers can enforce a required-name policy
    name: element.dataset.blockName || '',
    color: element.dataset.blockColor || selectedColor,
    origin: element.dataset.blockOrigin || 'template',
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : selectedDuration
  };
}

function handleCreatedBlockDragStart(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('.create-form__list-item') : null;
  if (!target || !event.dataTransfer) {
    return;
  }
  const payload = getBlockPayloadFromElement(target);
  if (!payload) {
    return;
  }
  const data = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/json', data);
  event.dataTransfer.setData('text/plain', data);
  try { window.__timeblock_payload = payload; } catch (err) {}
  target.classList.add('is-dragging');
}

function handleCreatedBlockDragEnd(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('.create-form__list-item') : null;
  if (target) {
    target.classList.remove('is-dragging');
    try { window.__timeblock_payload = null; } catch (err) {}
  }
}

createdBlocksContainer?.addEventListener('dragstart', handleCreatedBlockDragStart);
createdBlocksContainer?.addEventListener('dragend', handleCreatedBlockDragEnd);

function hasBlockPayload(dataTransfer) {
  // Some browsers clear dataTransfer.types during dragover/drop; use global fallback if present
  if (!dataTransfer) {
    return typeof window !== 'undefined' && Boolean(window.__timeblock_payload);
  }
  const types = Array.from(dataTransfer.types || []);
  const has = types.includes('application/json') || types.includes('text/plain');
  if (has) return true;
  if (typeof window !== 'undefined' && window.__timeblock_payload) return true;
  return false;
}

function parseBlockTransfer(dataTransfer) {
  if (!dataTransfer) {
    // fallback to global payload if available (robustness for some browsers)
    if (typeof window !== 'undefined' && window.__timeblock_payload) {
      return window.__timeblock_payload;
    }
    return null;
  }
  const raw = dataTransfer.getData('application/json') || dataTransfer.getData('text/plain');
  if (!raw) {
    if (typeof window !== 'undefined' && window.__timeblock_payload) {
      return window.__timeblock_payload;
    }
    return null;
  }
  try {
    const payload = JSON.parse(raw);
    if (payload && typeof payload === 'object' && !payload.origin) {
      payload.origin = 'template';
    }
    return payload;
  } catch (error) {
    // if parsing fails, attempt to use global fallback payload
    if (typeof window !== 'undefined' && window.__timeblock_payload) {
      return window.__timeblock_payload;
    }
    return null;
  }
}

function computeDropSlot(surface, clientY, durationSlots) {
  const rect = surface.getBoundingClientRect();
  const offsetY = clientY - rect.top;
  const slotHeight = rect.height / (TOTAL_SLOTS + 1);
  if (!Number.isFinite(slotHeight) || slotHeight <= 0) {
    return 0;
  }
  const rawSlot = Math.floor(offsetY / slotHeight);
  const maxStart = Math.max(0, TOTAL_SLOTS - durationSlots);
  return Math.min(maxStart, Math.max(0, rawSlot));
}

// Drop-location highlight utilities
function ensureDropHighlight(surface) {
  if (!surface) return null;
  let hl = surface.querySelector('.day-column__slot-highlight');
  if (!hl) {
    hl = document.createElement('div');
    hl.className = 'day-column__slot-highlight';
    surface.appendChild(hl);
  }
  return hl;
}

function showDropHighlight(surface, startSlot, durationSlots) {
  const hl = ensureDropHighlight(surface);
  if (!hl) return;
  hl.style.setProperty('--highlight-start', String(startSlot));
  hl.style.setProperty('--highlight-span', String(Math.max(1, durationSlots)));
  hl.style.opacity = '1';
}

function hideDropHighlight(surface) {
  if (!surface) return;
  const hl = surface.querySelector('.day-column__slot-highlight');
  if (hl) hl.style.opacity = '0';
}

function hideAllDropHighlights() {
  daySurfaces.forEach((s) => hideDropHighlight(s));
}

function buildScheduledBlockElement(block) {
  const element = document.createElement('article');
  element.className = 'time-block time-block--scheduled';
  element.style.setProperty('--start', String(block.startSlot));
  element.style.setProperty('--span', String(block.durationSlots));
  element.style.setProperty('--block-color', block.color);
  const durationLabel = formatDurationHours(block.durationHours);
  const startText = typeof block.startHour === 'number'
    ? formatTimeOfDay(block.startHour)
    : formatTimeOfDay(HOURS_VIEW_START + (block.startSlot || 0) / SLOTS_PER_HOUR);
  element.dataset.blockId = block.id;
  element.dataset.blockOrigin = 'scheduled';
  element.dataset.startSlot = String(block.startSlot);
  element.dataset.durationSlots = String(block.durationSlots);
  if (typeof block.dayIndex === 'number' && block.dayIndex >= 0) {
    element.dataset.dayIndex = String(block.dayIndex);
  }
  if (block.date) element.dataset.date = block.date;
  element.setAttribute('draggable', 'true');
  element.addEventListener('dragstart', (ev) => {
    try {
      if (ev.dataTransfer) {
        const payload = {
          id: block.id,
          origin: 'scheduled',
          name: block.name,
          color: block.color,
          durationMinutes: block.durationMinutes,
          durationSlots: block.durationSlots
        };
        ev.dataTransfer.setData('application/json', JSON.stringify(payload));
        ev.dataTransfer.setData('text/plain', block.id);
        try { window.__timeblock_payload = payload; } catch (err) {}
        ev.dataTransfer.effectAllowed = 'move';
      }
  dbg('dragstart (scheduled)', { id: block.id, origin: 'scheduled', startSlot: block.startSlot });
      element.classList.add('is-dragging');
    } catch (e) {
      // ignore
    }
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('is-dragging');
    try { window.__timeblock_payload = null; } catch (err) {}
  });
  element.innerHTML = `
    <div class="time-block__content">
      <span class="time-block__start">${startText}</span>
      <span class="time-block__label">${escapeHtml(block.name)}</span>
      <span class="time-block__duration">${durationLabel}</span>
    </div>
  `;

  // Pointer-drag fallback (for browsers with flaky HTML5 DnD)
  let pointerState = null;
  const DRAG_THRESHOLD = 8; // pixels
  element.addEventListener('pointerdown', (evt) => {
    try {
      if (evt.button !== 0) return; // only left button
      evt.preventDefault();
      element.setPointerCapture(evt.pointerId);
      // disable native HTML5 DnD while using pointer fallback to avoid duplicate drop handling
      element.draggable = false;
      element.__usingPointerDrag = true;
      pointerState = { id: evt.pointerId, startX: evt.clientX, startY: evt.clientY, dragging: false };
      // show ghost but don't treat tiny clicks as drags until movement threshold is exceeded
      dragGhost.show(block.name || 'Block', evt.clientX + 12, evt.clientY + 12);
      dbg('pointerdown', { id: block.id, x: evt.clientX, y: evt.clientY });
    } catch (e) {}
  });

  element.addEventListener('pointermove', (evt) => {
    try {
      if (!pointerState || pointerState.id !== evt.pointerId) return;
      const dx = Math.abs(evt.clientX - pointerState.startX);
      const dy = Math.abs(evt.clientY - pointerState.startY);
      if (!pointerState.dragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        // mark as actual drag only after threshold
        pointerState.dragging = true;
      }
      if (pointerState.dragging) {
        dragGhost.move(evt.clientX + 12, evt.clientY + 12);
      }
    } catch (e) {}

  });

  element.addEventListener('pointerup', (evt) => {
    try {
      if (!pointerState || pointerState.id !== evt.pointerId) return;
      // if not a real drag (small movement), treat as a click — restore state and do nothing
      if (!pointerState.dragging) {
        dragGhost.hide();
        element.releasePointerCapture(evt.pointerId);
        pointerState = null;
        element.draggable = true;
        element.__usingPointerDrag = false;
        return;
      }
      // real drag: perform drop logic
      dragGhost.hide();
      element.releasePointerCapture(evt.pointerId);
      pointerState = null;
      // restore native draggable behavior
      element.draggable = true;
      element.__usingPointerDrag = false;
      // compute element under pointer
      const target = document.elementFromPoint(evt.clientX, evt.clientY);
      if (!target) return;
      const surface = target.closest && target.closest('.day-column__surface');
      const trash = target.closest && target.closest('#trash-button');
      if (trash) {
        // delete scheduled
        const idx = scheduledBlocks.findIndex((b) => b.id === block.id);
        if (idx !== -1) {
          scheduledBlocks.splice(idx, 1);
          const el = appRoot.querySelector(`[data-block-id="${block.id}"]`);
          if (el) el.remove();
          saveState();
        }
        return;
      }
      if (surface) {
        // compute drop slot and move
        const slotHeight = surface.getBoundingClientRect().height / (TOTAL_SLOTS + 1);
        const rect = surface.getBoundingClientRect();
        const offsetY = evt.clientY - rect.top;
        const rawSlot = Math.floor(offsetY / slotHeight);
        const durationSlots = block.durationSlots || Math.max(1, Math.round((block.durationMinutes / 60) * SLOTS_PER_HOUR));
        const maxStart = Math.max(0, TOTAL_SLOTS - durationSlots);
        const startSlot = Math.min(maxStart, Math.max(0, rawSlot));
        const dayColumn = surface.closest('.day-column');
        const dayIndex = dayColumn ? dayColumns.indexOf(dayColumn) : -1;
        // update block data
        const idx = scheduledBlocks.findIndex((b) => b.id === block.id);
        if (idx !== -1) {
          const existing = scheduledBlocks[idx];
          existing.startSlot = startSlot;
          existing.dayIndex = dayIndex;
          existing.date = dayColumn ? dayColumn.dataset.date : existing.date;
          existing.startHour = HOURS_VIEW_START + startSlot / SLOTS_PER_HOUR;
          existing.durationSlots = durationSlots;
          existing.durationHours = durationSlots / SLOTS_PER_HOUR;
        }
        // move DOM element
        const existingEl = appRoot.querySelector(`[data-block-id="${block.id}"]`);
        if (existingEl) {
          existingEl.style.setProperty('--start', String(startSlot));
          existingEl.style.setProperty('--span', String(durationSlots));
          existingEl.dataset.startSlot = String(startSlot);
          existingEl.dataset.durationSlots = String(durationSlots);
          existingEl.dataset.dayIndex = String(dayIndex);
          if (dayColumn) existingEl.dataset.date = dayColumn.dataset.date;
          // update visible start time label to reflect new position
          try {
            const label = existingEl.querySelector('.time-block__start');
            if (label) label.textContent = formatTimeOfDay(HOURS_VIEW_START + startSlot / SLOTS_PER_HOUR);
          } catch (e) {}
          surface.appendChild(existingEl);
        }
        alignSurfaceBlocks(surface);
        saveState();
        // mark recent move to avoid duplicate native drop handling
        try {
          window.__timeblock_recentMove = { id: block.id, ts: Date.now() };
        } catch (err) {}
      }
    } catch (e) {}
  });
  element.addEventListener('pointercancel', (evt) => {
    try {
      if (pointerState && pointerState.id === evt.pointerId) {
        pointerState = null;
        dragGhost.hide();
        element.releasePointerCapture(evt.pointerId);
        element.draggable = true;
        element.__usingPointerDrag = false;
      }
    } catch (e) {}
  });
  return element;
}

function handleSurfaceDragEnter(event) {
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  const surface = event.currentTarget;
  surface.classList.add('is-drop-target');
  // attempt initial highlight
  const payload = parseBlockTransfer(event.dataTransfer);
  if (payload) {
    const durationMinutes = Number(payload.durationMinutes);
    const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
    const startSlot = computeDropSlot(surface, event.clientY, durationSlots);
    showDropHighlight(surface, startSlot, durationSlots);
  }
}

function handleSurfaceDragOver(event) {
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  // update highlight position while dragging
  const surface = event.currentTarget;
  const payload = parseBlockTransfer(event.dataTransfer);
  if (payload) {
    const durationMinutes = Number(payload.durationMinutes);
    const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
    const startSlot = computeDropSlot(surface, event.clientY, durationSlots);
    showDropHighlight(surface, startSlot, durationSlots);
  }
}

function handleSurfaceDragLeave(event) {
  const surface = event.currentTarget;
  const related = event.relatedTarget;
  if (!surface.contains(related)) {
    surface.classList.remove('is-drop-target');
    hideDropHighlight(surface);
  }
}

function handleSurfaceDrop(event) {
  const surface = event.currentTarget;
  surface.classList.remove('is-drop-target');
  hideDropHighlight(surface);
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  const payload = parseBlockTransfer(event.dataTransfer);
  if (!payload) {
    return;
  }
  // ignore drops that duplicate a recent pointer-based move
  try {
    if (payload && payload.origin === 'scheduled' && window.__timeblock_recentMove && window.__timeblock_recentMove.id === payload.id && Date.now() - window.__timeblock_recentMove.ts < 700) {
      return;
    }
  } catch (err) {}
  dbg('handleSurfaceDrop payload', { payload, x: event.clientX, y: event.clientY });
  const durationMinutes = Number(payload.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return;
  }
  // If payload references an existing scheduled block (move), update its record instead of creating new
  const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
  const startSlot = computeDropSlot(surface, event.clientY, durationSlots);
  const dayColumn = surface.closest('.day-column');
  const dayIndex = dayColumn ? dayColumns.indexOf(dayColumn) : -1;
  if (payload && payload.id) {
    const idx = scheduledBlocks.findIndex((b) => b.id === payload.id);
    if (idx !== -1) {
      const existing = scheduledBlocks[idx];
      existing.startSlot = startSlot;
      existing.startHour = HOURS_VIEW_START + startSlot / SLOTS_PER_HOUR;
      existing.dayIndex = dayIndex;
      if (dayColumn && dayColumn.dataset.date) existing.date = dayColumn.dataset.date;
      existing.durationSlots = durationSlots;
      existing.durationHours = durationSlots / SLOTS_PER_HOUR;
      // move DOM element if present
      const existingEl = appRoot.querySelector(`[data-block-id="${payload.id}"]`);
      dbg('dropping scheduled block', { id: payload.id, startSlot, dayIndex });
      if (existingEl) {
        existingEl.style.setProperty('--start', String(existing.startSlot));
        existingEl.style.setProperty('--span', String(existing.durationSlots));
        existingEl.dataset.startSlot = String(existing.startSlot);
        existingEl.dataset.durationSlots = String(existing.durationSlots);
        existingEl.dataset.dayIndex = String(existing.dayIndex);
        if (dayColumn && dayColumn.dataset.date) existingEl.dataset.date = dayColumn.dataset.date;
        // update visible start time label after move
        try {
          const label = existingEl.querySelector('.time-block__start');
          if (label) label.textContent = formatTimeOfDay(existing.startHour);
        } catch (e) {}
        surface.appendChild(existingEl);
      }
      alignSurfaceBlocks(surface);
      saveState();
      return;
    }
  }
  // continuing for template-origin or new blocks
  // Enforce named templates: payload.name must exist and be non-empty
  if (!payload.name || String(payload.name).trim() === '') {
    // ignore anonymous/template without name
    dbg('rejecting anonymous template drop', { payload });
    return;
  }

  const scheduledBlock = {
    id: payload.id || `scheduled-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: String(payload.name).trim(),
    color: payload.color || selectedColor,
    durationMinutes,
    durationSlots,
    durationHours: durationSlots / SLOTS_PER_HOUR,
    startSlot,
    startHour: HOURS_VIEW_START + startSlot / SLOTS_PER_HOUR,
    dayIndex,
    // store absolute date for anchoring across week navigation
    date: surface.dataset.date || null
  };
  scheduledBlock.endHour = scheduledBlock.startHour + scheduledBlock.durationHours;
  const element = buildScheduledBlockElement(scheduledBlock);
  surface.appendChild(element);
  scheduledBlocks.push(scheduledBlock);
  if (payload.origin === 'template' && payload.id) {
    const index = createdBlocks.findIndex((item) => item.id === payload.id);
    if (index !== -1) {
      createdBlocks.splice(index, 1);
      renderCreatedBlocks();
    }
  }
  alignSurfaceBlocks(surface);
  // persist newly created scheduled block
  saveState();
}

function alignSurfaceBlocks(surface) {
  if (!surface) {
    return;
  }
  const blocks = Array.from(surface.querySelectorAll('.time-block--scheduled'));
  blocks.forEach((block) => {
    block.classList.remove('time-block--align-start', 'time-block--align-end');
    // clear previous overlap markers
    block.classList.remove('time-block--overlap');
    block.style.removeProperty('--overlap-top');
    block.style.removeProperty('--overlap-height');
    // clear previous stacking order
    block.style.removeProperty('z-index');
    // clear solid/translucent markers
    block.classList.remove('time-block--solid');
    block.classList.remove('time-block--translucent');
  });

  const entries = blocks
    .map((block) => {
      const start = Number(block.dataset.startSlot);
      const span = Number(block.dataset.durationSlots);
      return {
        element: block,
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(span) ? start + span : start + 1
      };
    })
    .sort((a, b) => a.start - b.start);

  // Ensure DOM stacking: set z-index based on start slot and append in ascending order so later-start blocks are on top
  try {
    entries.forEach((entry) => {
      if (entry && entry.element && entry.element.parentElement === surface) {
        // higher start -> higher z-index to ensure later blocks appear above earlier overlays
        const z = 1000 + (Number.isFinite(entry.start) ? entry.start : 0);
        entry.element.style.zIndex = String(z);
        surface.appendChild(entry.element);
      }
    });
  } catch (err) {
    // ignore DOM reorder failures
  }

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const first = entries[i];
      const second = entries[j];
      const overlap = first.end > second.start && second.end > first.start;
      if (!overlap) {
        continue;
      }
      first.element.classList.add('time-block--align-start');
      second.element.classList.add('time-block--align-end');
    }
  }

  // Calculate overlap pixel positions and set visual overlay vars per overlapping pair
  if (entries.length > 1) {
    const surfaceRect = surface.getBoundingClientRect();
    const slotHeight = surfaceRect.height / (TOTAL_SLOTS + 1);
    for (let a = 0; a < entries.length; a += 1) {
      for (let b = a + 1; b < entries.length; b += 1) {
        const A = entries[a];
        const B = entries[b];
        const overlapSlots = Math.min(A.end, B.end) - Math.max(A.start, B.start);
        if (overlapSlots > 0) {
          const overlapStartSlot = Math.max(A.start, B.start);
          const overlapHeightPx = Math.round(overlapSlots * slotHeight);
          // Apply overlay only to the earlier-start block (A) so the top block remains fully visible
          const overlapTopForA = Math.round((overlapStartSlot - A.start) * slotHeight);
          A.element.classList.add('time-block--overlap');
          A.element.style.setProperty('--overlap-top', `${overlapTopForA}px`);
          A.element.style.setProperty('--overlap-height', `${overlapHeightPx}px`);
          // Mark the later-start block (B) as translucent so both blocks remain readable
          B.element.classList.add('time-block--translucent');
          // ensure top block is visually above overlays
          B.element.style.zIndex = String(1200 + (Number.isFinite(B.start) ? B.start : 0));
        }
      }
    }
  }
}

daySurfaces.forEach((surface) => {
  if (!surface) {
    return;
  }
  surface.addEventListener('dragenter', handleSurfaceDragEnter);
  surface.addEventListener('dragover', handleSurfaceDragOver);
  surface.addEventListener('dragleave', handleSurfaceDragLeave);
  surface.addEventListener('drop', handleSurfaceDrop);
});

createButton?.addEventListener('click', () => {
  const nameValue = (nameInput?.value || '').trim();
  if (!nameValue) {
    // brief UI feedback: focus input and flash outline
    if (nameInput) {
      nameInput.classList.add('input--error');
      nameInput.focus();
      setTimeout(() => nameInput.classList.remove('input--error'), 900);
    }
    return;
  }
  const block = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: nameValue,
    color: selectedColor,
    duration: selectedDuration
  };
  createdBlocks.unshift(block);
  renderCreatedBlocks();
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
  scheduleAutoSave();
});

createNowButton?.addEventListener('click', () => {
  const nameValue = (nameInput?.value || '').trim();
  if (!nameValue) {
    if (nameInput) {
      nameInput.classList.add('input--error');
      nameInput.focus();
      setTimeout(() => nameInput.classList.remove('input--error'), 900);
    }
    return;
  }
  const color = selectedColor;
  const durationMinutes = Number(selectedDuration) || 60;
  const now = new Date();
  const context = computeWeekContext(weekOffset);
  const weekDates = getWeekDates(context);
  const todayIdx = now.getDay();
  const dayDate = weekDates[todayIdx];
  const dateStr = dayDate.toISOString().split('T')[0];
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const clampedHour = Math.min(HOURS_VIEW_END - 0.5, Math.max(HOURS_VIEW_START, hourNow));
  const startSlot = Math.round((clampedHour - HOURS_VIEW_START) * SLOTS_PER_HOUR);
  const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
  const maxStart = Math.max(0, TOTAL_SLOTS - durationSlots);
  const start = Math.min(maxStart, Math.max(0, startSlot));
  const scheduledBlock = {
    id: `scheduled-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: nameValue,
    color,
    durationMinutes,
    durationSlots,
    durationHours: durationSlots / SLOTS_PER_HOUR,
    startSlot: start,
    startHour: HOURS_VIEW_START + start / SLOTS_PER_HOUR,
    dayIndex: todayIdx,
    date: dateStr
  };
  scheduledBlock.endHour = scheduledBlock.startHour + scheduledBlock.durationHours;
  scheduledBlocks.push(scheduledBlock);
  const surface = daySurfaces[todayIdx];
  if (surface) {
    surface.appendChild(buildScheduledBlockElement(scheduledBlock));
    alignSurfaceBlocks(surface);
  }
  saveState();
});

if (counterButtons && counterButtons.length > 0) {
  counterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(button.dataset.step);
      if (Number.isNaN(step)) {
        return;
      }

      if (step > 0 && createdBlocks.length > 0) {
        const blockToDuplicate = createdBlocks[0];
        createdBlocks.unshift({
          ...blockToDuplicate,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`
        });
        renderCreatedBlocks();
        scheduleAutoSave();
      }
    });
  });
}

// Duplicate last created template into the templates list
duplicateLastButton?.addEventListener('click', () => {
  if (!Array.isArray(createdBlocks) || createdBlocks.length === 0) return;
  const last = createdBlocks[0];
  const copy = {
    ...last,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`
  };
  createdBlocks.unshift(copy);
  renderCreatedBlocks();
  scheduleAutoSave();
});

// Add current create-form block to Saved List panel
addToListButton?.addEventListener('click', () => {
  const nameValue = (nameInput?.value || '').trim();
  if (!nameValue) {
    if (nameInput) {
      nameInput.classList.add('input--error');
      nameInput.focus();
      setTimeout(() => nameInput.classList.remove('input--error'), 900);
    }
    return;
  }
  const block = {
    id: `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: nameValue,
    color: selectedColor,
    duration: selectedDuration
  };
  savedListBlocks.unshift(block);
  renderSavedListBlocks();
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
  scheduleAutoSave();
});

nameInput?.addEventListener('input', () => {
  // small convenience: schedule auto-save as user types name
  scheduleAutoSave();
});

viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.classList.contains('is-active')) {
      return;
    }
    viewButtons.forEach((item) => item.classList.remove('is-active'));
    viewButtons.forEach((item) => item.setAttribute('aria-selected', 'false'));
    button.classList.add('is-active');
    button.setAttribute('aria-selected', 'true');

    const view = button.dataset.view || 'week';
    gridDays?.setAttribute('data-view', view);
    console.debug('view toggle clicked', view);
    if (view === 'month') {
      try {
        renderMonthView();
        // update header range to show month label
        const now = new Date();
        const viewMonthDate = new Date(now.getFullYear(), now.getMonth() + weekOffset, 1);
        headerRange.textContent = viewMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      } catch (err) {
        console.error('renderMonthView failed', err);
      }
    } else {
      // restore week rendering
      try {
        // remove month page if present
  const monthPage = document.querySelector('.month-page');
  if (monthPage) monthPage.remove();
  const plannerEl = document.querySelector('.planner');
  if (plannerEl) plannerEl.style.display = '';
        renderWeekView();
        renderScheduledBlocksForWeek();
        updateHeaderRange();
      } catch (err) {
        console.error('renderWeekView failed', err);
      }
    }
  });
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.direction === 'prev' ? -1 : 1;
    weekOffset += direction;
    // If month view is active, re-render the month page and update header accordingly
    const currentView = gridDays?.dataset?.view || 'week';
    if (currentView === 'month') {
      try {
        // update header range to show month label
        const now = new Date();
        const viewMonthDate = new Date(now.getFullYear(), now.getMonth() + weekOffset, 1);
        headerRange.textContent = viewMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        renderMonthView();
        // also refresh week surfaces so scheduled blocks remain in sync
        renderScheduledBlocksForWeek();
      } catch (err) {
        console.error('renderMonthView failed on nav', err);
      }
      return;
    }

    // default: week view navigation
    updateHeaderRange();
    renderWeekView();
    // after changing the week view, re-render scheduled blocks so date-anchored
    // items are placed into the newly computed day surfaces
    renderScheduledBlocksForWeek();
  });
});
