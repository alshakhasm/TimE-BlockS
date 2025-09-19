/*
 * Renders a interactive concept of the TimE BlockS planner with
 * collapsible sidebar, palette, weekly board, and budget summary.
 */

const appRoot = document.querySelector('#app');
const headerRange = document.querySelector('#header-range');

if (!appRoot) {
  throw new Error('Missing app root container.');
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
const durationOptions = [30, 60, 90, 120, 150, 180];

const activities = [
  { id: 'cook', name: 'Cooking', color: 'hsl(35, 95%, 55%)', quota: 8, actual: 10 },
  { id: 'train', name: 'Strength', color: 'hsl(210, 92%, 62%)', quota: 5, actual: 4.5 },
  { id: 'read', name: 'Reading', color: 'hsl(265, 85%, 70%)', quota: 6, actual: 3.5 },
  { id: 'deep', name: 'Deep Work', color: 'hsl(150, 70%, 45%)', quota: 20, actual: 18 },
  { id: 'play', name: 'Play', color: 'hsl(0, 82%, 68%)', quota: 4, actual: 5.5 }
];

const activityMap = new Map(activities.map((item) => [item.id, item]));

const sampleBlocks = [
  { id: 'b1', activityId: 'deep', day: 1, start: 8, duration: 3 },
  { id: 'b2', activityId: 'train', day: 1, start: 8.5, duration: 1 },
  { id: 'b3', activityId: 'cook', day: 2, start: 18, duration: 1.5 },
  { id: 'b4', activityId: 'read', day: 3, start: 20, duration: 1.5 },
  { id: 'b5', activityId: 'deep', day: 3, start: 9, duration: 4 },
  { id: 'b6', activityId: 'deep', day: 4, start: 7, duration: 2.5 },
  { id: 'b7', activityId: 'train', day: 4, start: 7.5, duration: 1 },
  { id: 'b8', activityId: 'read', day: 4, start: 21, duration: 1 },
  { id: 'b9', activityId: 'play', day: 5, start: 19, duration: 2 },
  { id: 'b10', activityId: 'cook', day: 6, start: 11, duration: 2 },
  { id: 'b11', activityId: 'play', day: 6, start: 21, duration: 1.5 },
  { id: 'b12', activityId: 'deep', day: 0, start: 10, duration: 3 }
];

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

let weekOffset = 0;

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

function updateHeaderRange() {
  if (!headerRange) {
    return;
  }
  const context = computeWeekContext(weekOffset);
  const startLabel = rangeFormatter.format(context.start);
  const endLabel = rangeFormatter.format(context.end);
  headerRange.textContent = `Week ${context.weekNumber}, ${context.year} ${startLabel} – ${endLabel}`;
}

const hourRange = HOURS_VIEW_END - HOURS_VIEW_START;

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
    const isWeekend = day === 'Fri' || day === 'Sat';
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
    <button class="duration-chip ${index === 1 ? 'is-selected' : ''}" type="button" data-duration="${minutes}">
      ${minutes}m
    </button>
  `)
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
    <button class="rail-button is-active" type="button" data-panel="create" aria-pressed="true" title="Create">
      <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
    <button class="rail-button" type="button" data-panel="list" aria-pressed="false" title="History">
      <svg class="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12M6 12h12M6 17h12" />
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
            <label class="create-form__label" for="task-name">Task name</label>
            <input class="create-form__input" id="task-name" name="task-name" placeholder="e.g. Writing Sprint" type="text" />
          </div>
          <div class="create-form__group create-form__group--color">
            <label class="create-form__label" for="task-color">Accent color</label>
            <div class="color-picker">
              <input class="color-picker__input" id="task-color" name="task-color" type="color" value="#4f46e5" />
              <span class="color-picker__value" aria-live="polite">#4F46E5</span>
            </div>
          </div>
          <div class="create-form__group">
            <span class="create-form__label">Time allowance</span>
            <div class="duration-chips">
              ${durationChipsMarkup}
            </div>
          </div>
          <div class="create-form__palette">
            <span class="create-form__label create-form__label--caps">Templates</span>
            <div class="create-form__palette-grid">
              ${paletteMarkup}
            </div>
          </div>
          <button class="create-form__submit" type="button">Stage block</button>
        </form>
      </div>
      <div class="sidebar__panel sidebar__panel--list" data-panel="list">
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
  <section class="summary">
    <header class="summary__header">
      <h2 class="summary__title">Time Budget Ledger</h2>
      <p class="summary__hint">Watch the bars — they glow when you lean in, flash when you overdo it.</p>
    </header>
    <div class="summary__content">
      ${quotaStatus
        .map(
          (activity) => `
            <div class="summary-item ${activity.over ? 'summary-item--over' : ''}">
              <div class="summary-item__label">
                <span class="summary-item__name">${activity.name}</span>
                <span class="summary-item__qty">${activity.actual}/${activity.quota} hrs ${activity.over ? '❌' : ''}</span>
              </div>
              <div class="summary-item__bar" style="--bar-color:${activity.color};">
                <span class="summary-item__progress" style="--progress:${activity.percentage}"></span>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  </section>
`;

const sidebar = appRoot.querySelector('.sidebar');
const workspace = appRoot.querySelector('.workspace');
const sidebarPanels = Array.from(appRoot.querySelectorAll('.sidebar__panel'));
const railButtons = Array.from(document.querySelectorAll('.rail-button'));
const paletteButtons = Array.from(appRoot.querySelectorAll('.palette-item'));
const viewButtons = Array.from(document.querySelectorAll('.view-toggle'));
const gridDays = appRoot.querySelector('.grid-days');
const durationChips = Array.from(appRoot.querySelectorAll('.duration-chip'));
const colorInput = appRoot.querySelector('.color-picker__input');
const colorValue = appRoot.querySelector('.color-picker__value');
const navButtons = Array.from(document.querySelectorAll('[data-direction]'));

updateHeaderRange();

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

if (colorInput && colorValue) {
  const updateColorValue = (value) => {
    colorValue.textContent = value.toUpperCase();
  };

  updateColorValue(colorInput.value);
  colorInput.addEventListener('input', (event) => {
    const nextValue = event.target.value;
    updateColorValue(nextValue);
  });
}

durationChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    durationChips.forEach((item) => item.classList.remove('is-selected'));
    chip.classList.add('is-selected');
  });
});

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    paletteButtons.forEach((item) => item.classList.remove('palette-item--active'));
    button.classList.add('palette-item--active');
  });
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
  });
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.direction === 'prev' ? -1 : 1;
    weekOffset += direction;
    updateHeaderRange();
  });
});
