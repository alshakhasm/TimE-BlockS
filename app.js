/*
 * Renders a interactive concept of the TimE BlockS planner with
 * collapsible sidebar, palette, weekly board, and budget summary.
 */

const appRoot = document.querySelector('#app');
const headerRange = document.querySelector('#header-range');

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
  headerRange.textContent = `Week ${context.weekNumber}, ${context.year} ${startLabel} – ${endLabel}`;
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
    const isWeekend = day === 'Sun' || day === 'Sat';
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
      ${formatDurationLabel(minutes)}
    </button>
  `)
  .join('');

const swatchOptions = [
  '#6366F1',
  '#22D3EE',
  '#10B981',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#0EA5E9',
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
            <input class="create-form__input" id="task-name" name="task-name" placeholder="e.g. Writing Sprint" type="text" />
          </div>
          <div class="create-form__group">
            <span class="create-form__label">Accent color</span>
            <div class="color-swatch-grid">
              ${colorSwatchMarkup}
            </div>
            <div class="create-form__info">
              <div class="block-counter">
                <button class="counter-button" type="button" data-step="-1" aria-label="Decrease block count">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8" /></svg>
                </button>
                <span id="block-count-display">Blocks: 0</span>
                <button class="counter-button" type="button" data-step="1" aria-label="Increase block count">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v8M8 12h8" /></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="create-form__group">
            <span class="create-form__label">Time allowance</span>
            <div class="duration-chips">
              ${durationChipsMarkup}
            </div>
          </div>
          <button class="create-form__submit" type="button">Create block</button>
          <div class="create-form__list" id="created-blocks" aria-live="polite"></div>
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
const blockCountDisplay = appRoot.querySelector('#block-count-display');
const createdBlocksContainer = appRoot.querySelector('#created-blocks');
const createButton = appRoot.querySelector('.create-form__submit');
const counterButtons = Array.from(appRoot.querySelectorAll('.counter-button'));

let selectedColor = swatchOptions[0];
let selectedDuration = durationOptions[1] ?? durationOptions[0];
const createdBlocks = [];
const scheduledBlocks = [];

updateHeaderRange();

function renderWeekView() {
  if (!gridDays) {
    return;
  }

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

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    column.classList.toggle('day-column--weekend', Boolean(isWeekend));
  });
}

renderWeekView();

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
  if (!blockCountDisplay || !createdBlocksContainer) {
    return;
  }
  blockCountDisplay.textContent = `Blocks: ${createdBlocks.length}`;
  if (createdBlocks.length === 0) {
    createdBlocksContainer.innerHTML = '<p class="create-form__empty">No blocks yet.</p>';
    return;
  }

  createdBlocksContainer.innerHTML = createdBlocks
    .map(
      (block) => `
        <article class="create-form__list-item" draggable="true" style="--block-color:${block.color}" data-block-id="${block.id}" data-block-name="${escapeHtml(block.name)}" data-block-color="${block.color}" data-block-duration="${block.duration}">
          <span class="create-form__list-duration">${formatDurationLabel(block.duration)}</span>
          <span class="create-form__list-name">${escapeHtml(block.name)}</span>
        </article>
      `
    )
    .join('');
}

setSelectedColor(selectedColor);
renderCreatedBlocks();

function getBlockPayloadFromElement(element) {
  if (!element) {
    return null;
  }
  const duration = Number(element.dataset.blockDuration);
  return {
    id: element.dataset.blockId || '',
    name: element.dataset.blockName || 'Untitled block',
    color: element.dataset.blockColor || selectedColor,
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
  target.classList.add('is-dragging');
}

function handleCreatedBlockDragEnd(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('.create-form__list-item') : null;
  if (target) {
    target.classList.remove('is-dragging');
  }
}

createdBlocksContainer?.addEventListener('dragstart', handleCreatedBlockDragStart);
createdBlocksContainer?.addEventListener('dragend', handleCreatedBlockDragEnd);

function hasBlockPayload(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }
  const types = Array.from(dataTransfer.types || []);
  return types.includes('application/json') || types.includes('text/plain');
}

function parseBlockTransfer(dataTransfer) {
  if (!dataTransfer) {
    return null;
  }
  const raw = dataTransfer.getData('application/json') || dataTransfer.getData('text/plain');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
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

function buildScheduledBlockElement(block) {
  const element = document.createElement('article');
  element.className = 'time-block time-block--scheduled';
  element.style.setProperty('--start', String(block.startSlot));
  element.style.setProperty('--span', String(block.durationSlots));
  element.style.setProperty('--block-color', block.color);
  const durationLabel = formatDurationHours(block.durationHours);
  const startLabel = formatTimeOfDay(block.startHour);
  const endLabel = formatTimeOfDay(block.endHour);
  element.dataset.blockId = block.id;
  if (typeof block.dayIndex === 'number' && block.dayIndex >= 0) {
    element.dataset.dayIndex = String(block.dayIndex);
  }
  element.innerHTML = `
    <span class="time-block__label">${escapeHtml(block.name)}</span>
    <span class="time-block__duration">${durationLabel}</span>
    <span class="time-block__time">${startLabel} – ${endLabel}</span>
  `;
  return element;
}

function handleSurfaceDragEnter(event) {
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  const surface = event.currentTarget;
  surface.classList.add('is-drop-target');
}

function handleSurfaceDragOver(event) {
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleSurfaceDragLeave(event) {
  const surface = event.currentTarget;
  const related = event.relatedTarget;
  if (!surface.contains(related)) {
    surface.classList.remove('is-drop-target');
  }
}

function handleSurfaceDrop(event) {
  const surface = event.currentTarget;
  surface.classList.remove('is-drop-target');
  if (!hasBlockPayload(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  const payload = parseBlockTransfer(event.dataTransfer);
  if (!payload) {
    return;
  }
  const durationMinutes = Number(payload.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return;
  }
  const durationSlots = Math.max(1, Math.round((durationMinutes / 60) * SLOTS_PER_HOUR));
  const startSlot = computeDropSlot(surface, event.clientY, durationSlots);
  const dayColumn = surface.closest('.day-column');
  const dayIndex = dayColumn ? dayColumns.indexOf(dayColumn) : -1;
  const scheduledBlock = {
    id: payload.id || `scheduled-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: payload.name || 'Untitled block',
    color: payload.color || selectedColor,
    durationMinutes,
    durationSlots,
    durationHours: durationSlots / SLOTS_PER_HOUR,
    startSlot,
    startHour: HOURS_VIEW_START + startSlot / SLOTS_PER_HOUR,
    dayIndex
  };
  scheduledBlock.endHour = scheduledBlock.startHour + scheduledBlock.durationHours;
  const element = buildScheduledBlockElement(scheduledBlock);
  surface.appendChild(element);
  scheduledBlocks.push(scheduledBlock);
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
  const block = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: nameValue || 'Untitled block',
    color: selectedColor,
    duration: selectedDuration
  };
  createdBlocks.unshift(block);
  renderCreatedBlocks();
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
});

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
      return;
    }

    if (step < 0 && createdBlocks.length > 0) {
      createdBlocks.shift();
      renderCreatedBlocks();
    }
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
    renderWeekView();
  });
});
