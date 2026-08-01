/*
 * Parts Finder block
 *
 * Reproduces the Parts Finder widget at https://www.drivparts.com/
 * (`.driv-part-finder-corporate`). Vehicle and Engine tabs are fully wired;
 * Performance, VIN and Specification tabs are shown disabled (labels match
 * the live site, no catalog/search behavior). Catalog data is fetched through the
 * `catalog-api` Cloudflare Worker's `/drivparts/*` passthrough route (never
 * directly from drivparts.com/moogparts.com), and submitting a search
 * navigates to a same-origin `/results` page that is built separately.
 *
 * UI chrome strings (tab labels, field placeholders, errors) come from
 * `/placeholders.json` via keys — see scripts/placeholders.js.
 */

import { fetchPlaceholders, getPlaceholdersPrefix } from '../../../scripts/placeholders.js';
import { sitePath } from '../../../scripts/drivparts-paths.js';

export const CATALOG_API_BASE = 'https://moogparts-catalog-api.atul-code-auth0.workers.dev';
/** Shared query params sent with every catalog-api request. */
const CATALOG_PARAMS = { brand: 'corporate', locale: 'en_US', country_code: 'US' };

/** English fallbacks when placeholders.json is missing or a key is absent. */
const FALLBACK_LABELS = {
  partsFinderTitle: 'Parts Finder',
  tabVehicle: 'Vehicle',
  tabEngine: 'Engine',
  tabPerformance: 'Performance',
  tabVin: 'VIN',
  tabSpecification: 'Specification',
  applicationType: 'Application Type',
  year: 'Year',
  make: 'Make',
  model: 'Model',
  manufacturer: 'Manufacturer',
  vehicleType: 'Vehicle type',
  base: 'Base',
  allYears: 'All years',
  lookItUp: 'look it up',
  noMatches: 'No matches',
  loadError: "Couldn't load options.",
  retry: 'Retry',
};

/** Active labels for this decorate pass (placeholders merged over fallbacks). */
let labels = { ...FALLBACK_LABELS };

/**
 * Resolves a placeholder key to display text.
 * @param {keyof typeof FALLBACK_LABELS} key
 * @returns {string}
 */
function t(key) {
  return labels[key] || FALLBACK_LABELS[key] || '';
}

// Source: `vehicletypes` JSON attribute on the live Vehicle tab container.
export const VEHICLE_TYPES = [
  { label: 'Car & Truck', groupId: '2,8' },
  { label: 'Powersport', groupId: '7' },
  { label: 'Agricultural', groupId: '10' },
  { label: 'Construction', groupId: '9' },
  { label: 'Industrial', groupId: '11' },
  { label: 'Lawn & Garden', groupId: '13' },
  { label: 'Marine', groupId: '14' },
  { label: 'Power Generation', groupId: '12' },
];

// Car & Truck and Powersport use Year/Make/Model (catalog YMM). All other
// application types use Vehicle type → Manufacturer → Model → Year
// (equipment APIs). Verified against live field ids: Powersport → years/makes/
// models; Agricultural+ → vehicle_types/mfrs/equipment_models/equipment_years.
const YMM_GROUP_IDS = new Set(['2,8', '7']);

/** Whether a vehicle-type groupId uses the Year/Make/Model cascade, vs. the equipment cascade. */
export function isYmmType(groupId) {
  return YMM_GROUP_IDS.has(groupId);
}

// Source: `enginetypes` JSON attribute on the live Engine tab container --
// only one entry, so this is a fixed label rather than a real dropdown.
const ENGINE_TYPE = { label: 'Heavy Duty/Industrial', groupId: '90023' };

let instanceCount = 0;
const openDropdowns = new Set();

/** Builds a catalog-api URL for a passthrough endpoint, merging the shared brand/locale params. */
export function buildCatalogUrl(endpoint, params) {
  const usp = new URLSearchParams({ ...CATALOG_PARAMS, ...params });
  return `${CATALOG_API_BASE}/drivparts/${endpoint}?${usp}`;
}

/**
 * Fetches JSON, normalizing network failures and non-2xx responses to `{ ok: false }`
 * instead of throwing, so callers can drive a single error/retry path.
 * @returns {Promise<{ ok: boolean, data?: unknown }>}
 */
export async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

/** Removes a field's inline error message, if one is showing. */
function clearFieldError(field) {
  const error = field.querySelector('.parts-finder-field-error');
  if (error) error.remove();
}

/** Shows an inline error with a Retry button in place of a failed dropdown load. */
function showFieldError(field, retry) {
  clearFieldError(field);
  const error = document.createElement('p');
  error.className = 'parts-finder-field-error';
  error.textContent = `${t('loadError')} `;
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.textContent = t('retry');
  retryBtn.addEventListener('click', retry);
  error.append(retryBtn);
  field.append(error);
}

/** Closes every open dropdown except the one passed in, if any (e.g. on outside click). */
export function closeAllDropdowns(except) {
  openDropdowns.forEach((dropdown) => {
    if (dropdown !== except) dropdown.close();
  });
}

/**
 * Custom combobox dropdown (replaces native <select> so the open menu is
 * styled in-page rather than using the OS picker). Search lives in the field
 * itself (live vue-select pattern) — the open menu is options only.
 * @param {{ id: string, label: string, placeholder?: string }} config
 */
export function createDropdown({ id, label, placeholder = '' }) {
  const root = document.createElement('div');
  root.className = 'parts-finder-dropdown is-disabled';

  const toggle = document.createElement('div');
  toggle.className = 'parts-finder-dropdown-toggle';
  toggle.id = id;

  const valueEl = document.createElement('span');
  valueEl.className = 'parts-finder-dropdown-value is-placeholder';
  valueEl.textContent = placeholder;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'parts-finder-dropdown-search';
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'false');
  search.setAttribute('aria-haspopup', 'listbox');
  search.setAttribute('aria-label', label);
  search.autocomplete = 'off';
  search.disabled = true;

  const caret = document.createElement('span');
  caret.className = 'parts-finder-dropdown-caret';
  caret.setAttribute('aria-hidden', 'true');

  toggle.append(valueEl, search, caret);

  const menu = document.createElement('div');
  menu.className = 'parts-finder-dropdown-menu';
  menu.hidden = true;

  const list = document.createElement('ul');
  list.className = 'parts-finder-dropdown-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  search.setAttribute('aria-controls', list.id);

  menu.append(list);
  root.append(toggle, menu);

  let options = [];
  let value = '';
  let selectedLabel = '';
  let activeIndex = -1;
  let changeHandler = null;
  let placeholderText = placeholder;
  let api;
  let disabled = true;

  // Shows the selected value or placeholder in the toggle, hiding it while the user is
  // actively typing a search query so the in-progress query text isn't obscured.
  function syncFieldDisplay(query) {
    const searching = root.classList.contains('is-open') && query.length > 0;
    if (searching) {
      valueEl.hidden = true;
      return;
    }
    valueEl.hidden = false;
    if (selectedLabel) {
      valueEl.textContent = selectedLabel;
      valueEl.classList.remove('is-placeholder');
    } else {
      valueEl.textContent = placeholderText;
      valueEl.classList.toggle('is-placeholder', Boolean(placeholderText));
    }
  }

  // Commits an option as the current value, closes the menu, restores focus to the
  // field, and notifies the owning panel via the registered change handler.
  function selectOption(opt) {
    value = opt.value;
    selectedLabel = opt.label;
    search.value = '';
    syncFieldDisplay('');
    api.close();
    search.focus();
    if (changeHandler) changeHandler();
  }

  // Highlights the option at activeIndex and keeps aria-activedescendant in sync so
  // screen reader users hear the active option as they arrow through the list.
  function updateActiveOption() {
    const items = [...list.querySelectorAll('.parts-finder-dropdown-option')];
    items.forEach((item, index) => {
      item.classList.toggle('is-active', index === activeIndex);
    });
    const active = items[activeIndex];
    if (active) {
      search.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      search.removeAttribute('aria-activedescendant');
    }
  }

  // Rebuilds the option list filtered by query (case-insensitive substring match),
  // or a single "no matches" placeholder item when nothing filters through.
  function renderList(query) {
    const normalized = query.trim().toLowerCase();
    list.textContent = '';
    const filtered = normalized
      ? options.filter((opt) => opt.label.toLowerCase().includes(normalized))
      : options;

    if (!filtered.length) {
      const empty = document.createElement('li');
      empty.className = 'parts-finder-dropdown-empty';
      empty.textContent = t('noMatches');
      list.append(empty);
      return;
    }

    filtered.forEach((opt, index) => {
      const item = document.createElement('li');
      item.id = `${list.id}-opt-${index}`;
      item.className = 'parts-finder-dropdown-option';
      item.setAttribute('role', 'option');
      item.dataset.value = opt.value;
      item.textContent = opt.label;
      item.setAttribute('aria-selected', String(opt.value === value));
      if (opt.value === value) item.classList.add('is-selected');
      // Visible but inert, matching live's not-yet-supported search modes.
      if (opt.disabled) {
        item.classList.add('is-disabled');
        item.setAttribute('aria-disabled', 'true');
      }
      item.addEventListener('mousedown', (event) => {
        // mousedown so selection happens before search blur/close
        event.preventDefault();
        if (opt.disabled) return;
        selectOption(opt);
      });
      list.append(item);
    });
  }

  api = {
    root,
    get value() { return value; },
    get label() { return selectedLabel; },
    onChange(fn) { changeHandler = fn; },
    // Enables/disables the field; disabling also closes an open menu.
    setDisabled(nextDisabled) {
      disabled = nextDisabled;
      search.disabled = nextDisabled;
      root.classList.toggle('is-disabled', nextDisabled);
      if (nextDisabled) api.close();
    },
    // Replaces the available options and clears the current selection (used when an
    // upstream field changes and this field's choices need to be reloaded).
    setOptions(nextOptions, nextPlaceholder) {
      options = nextOptions;
      if (nextPlaceholder !== undefined) placeholderText = nextPlaceholder;
      value = '';
      selectedLabel = '';
      search.value = '';
      syncFieldDisplay('');
      renderList('');
      api.close();
    },
    // Selects an option by value; a no-op if it's not among the current options
    // (e.g. hydrating from a URL value the catalog no longer returns).
    setValue(nextValue) {
      const match = options.find((opt) => opt.value === nextValue);
      if (!match) return;
      value = match.value;
      selectedLabel = match.label;
      search.value = '';
      syncFieldDisplay('');
      renderList('');
    },
    // Opens the menu, closing any other open dropdown first (only one open at a time).
    open() {
      if (disabled) return;
      closeAllDropdowns(api);
      menu.hidden = false;
      root.classList.add('is-open');
      search.setAttribute('aria-expanded', 'true');
      openDropdowns.add(api);
      search.value = '';
      syncFieldDisplay('');
      renderList('');
      activeIndex = options.findIndex((opt) => opt.value === value);
      updateActiveOption();
      search.focus();
    },
    // Closes the menu and clears transient search/active-option state.
    close() {
      if (menu.hidden) return;
      menu.hidden = true;
      root.classList.remove('is-open');
      search.setAttribute('aria-expanded', 'false');
      openDropdowns.delete(api);
      activeIndex = -1;
      search.removeAttribute('aria-activedescendant');
      search.value = '';
      syncFieldDisplay('');
    },
  };

  toggle.addEventListener('mousedown', (event) => {
    if (disabled) return;
    // Keep focus on the in-field search; caret/value clicks toggle the menu.
    if (event.target === search) return;
    event.preventDefault();
    if (menu.hidden) api.open();
    else api.close();
  });

  search.addEventListener('focus', () => {
    if (!disabled && menu.hidden) api.open();
  });

  search.addEventListener('input', () => {
    if (menu.hidden) api.open();
    syncFieldDisplay(search.value);
    activeIndex = 0;
    renderList(search.value);
    updateActiveOption();
  });

  search.addEventListener('keydown', (event) => {
    if (disabled) return;
    const items = [...list.querySelectorAll('.parts-finder-dropdown-option')];
    if (event.key === 'Escape') {
      event.preventDefault();
      api.close();
      search.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (menu.hidden) {
        api.open();
        return;
      }
      if (!items.length) return;
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveOption();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveOption();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (menu.hidden) {
        api.open();
        return;
      }
      const active = items[activeIndex];
      if (!active) return;
      const match = options.find((opt) => opt.value === active.dataset.value);
      if (match && !match.disabled) selectOption(match);
    }
  });

  return api;
}

// Closes any open dropdown (across all block instances on the page) when a click
// lands outside its root, matching native <select>/combobox dismissal behavior.
document.addEventListener('click', (event) => {
  openDropdowns.forEach((dropdown) => {
    if (!dropdown.root.contains(event.target)) dropdown.close();
  });
});

/** Clears a field to its empty, disabled, error-free state (e.g. an upstream field changed). */
export function resetField(dropdown, placeholder) {
  const field = dropdown.root.closest('.parts-finder-field');
  clearFieldError(field);
  field.classList.remove('is-loading');
  dropdown.setOptions([], placeholder);
  dropdown.setDisabled(true);
}

// Per-dropdown request counter so populateDropdown can ignore a response that's been
// superseded by a newer load for the same dropdown before it resolves.
const dropdownLoadIds = new WeakMap();

/**
 * Fetches options for a dropdown from `url` and populates it, showing a loading state
 * while in flight and an inline retry on failure. Stale responses (superseded by a newer
 * call for the same dropdown while this one was in flight) are silently dropped.
 * @param {ReturnType<typeof createDropdown>} dropdown
 * @param {string} url Catalog-api URL to fetch (see buildCatalogUrl)
 * @param {(data: unknown) => Array<{ value: string, label: string }>} mapFn Maps the
 *   response JSON to dropdown options
 * @param {string} placeholder Placeholder to show while empty/loading/errored
 */
export async function populateDropdown(dropdown, url, mapFn, placeholder) {
  const field = dropdown.root.closest('.parts-finder-field');
  dropdown.setDisabled(true);
  clearFieldError(field);
  field.classList.add('is-loading');
  // Ignore stale responses when a newer cascade load replaced this one
  // (e.g. results-page setSelection racing the panel's default activate).
  const loadId = (dropdownLoadIds.get(dropdown) || 0) + 1;
  dropdownLoadIds.set(dropdown, loadId);
  const result = await fetchJson(url);
  if (dropdownLoadIds.get(dropdown) !== loadId) return;
  field.classList.remove('is-loading');
  if (!result.ok) {
    dropdown.setOptions([], placeholder);
    showFieldError(field, () => populateDropdown(dropdown, url, mapFn, placeholder));
    return;
  }
  dropdown.setOptions(mapFn(result.data), placeholder);
  dropdown.setDisabled(false);
}

/**
 * Builds the `/results` URL for a Year/Make/Model (catalog) vehicle search.
 * Exact param names/order verified via a live round-trip (2020 Ford F-150):
 * type[value]=2,8&type[label]=Car%20%26%20Truck&year[value]=2020&year[label]=2020
 * &make[value]=54&make[label]=Ford&model[value]=666&model[label]=F-150&searchType=vehicle
 */
export function buildYmmResultsUrl(v) {
  return [
    `${sitePath('/results')}?`,
    `type[value]=${encodeURIComponent(v.groupId)}`,
    `&type[label]=${encodeURIComponent(v.typeLabel)}`,
    `&year[value]=${encodeURIComponent(v.year)}`,
    `&year[label]=${encodeURIComponent(v.year)}`,
    `&make[value]=${encodeURIComponent(v.makeId)}`,
    `&make[label]=${encodeURIComponent(v.makeLabel)}`,
    `&model[value]=${encodeURIComponent(v.modelId)}`,
    `&model[label]=${encodeURIComponent(v.modelLabel)}`,
    '&searchType=vehicle',
  ].join('');
}

/**
 * Builds the `/results` URL for an equipment (Vehicle type/Manufacturer/Model/Year) search.
 * Exact param names verified via a live round-trip (Agricultural / Combine / Allis-Chalmers).
 * Year is optional on live when omitted from the cascade.
 * type[value]=10&type[label]=Agricultural&vehicle[value]=2259&vehicle[label]=Combine
 * &mfr[value]=900070&mfr[label]=Allis-Chalmers
 * &equipmentModel[value]=<opaque>&equipmentModel[label]=...&searchType=vehicle
 */
function buildEquipmentResultsUrl(v) {
  const parts = [
    `${sitePath('/results')}?`,
    `type[value]=${encodeURIComponent(v.groupId)}`,
    `&type[label]=${encodeURIComponent(v.typeLabel)}`,
    `&vehicle[value]=${encodeURIComponent(v.vehicleTypeId)}`,
    `&vehicle[label]=${encodeURIComponent(v.vehicleTypeLabel)}`,
    `&mfr[value]=${encodeURIComponent(v.mfrId)}`,
    `&mfr[label]=${encodeURIComponent(v.mfrLabel)}`,
    `&equipmentModel[value]=${encodeURIComponent(v.modelId)}`,
    `&equipmentModel[label]=${encodeURIComponent(v.modelLabel)}`,
  ];
  if (v.year) {
    parts.push(
      `&year[value]=${encodeURIComponent(v.year)}`,
      `&year[label]=${encodeURIComponent(v.yearLabel || v.year)}`,
    );
  }
  parts.push('&searchType=vehicle');
  return parts.join('');
}

/**
 * Builds the `/results` URL for an Engine (Manufacturer/Base) search.
 * Exact param names verified via a live round-trip (Ford / Power Stroke 6.0L):
 * searchType=heavy&vehicleGroupIds[value]=90023&vehicleGroupIds[label]=Heavy Duty/Industrial
 * &heavyMfr[value]=22&heavyMfr[label]=Ford
 * &heavyBase[value]=<opaque engine_* string>&heavyBase[label]=...
 * Note this is a different convention than the Vehicle tab — implemented as captured, not unified.
 */
function buildEngineResultsUrl(v) {
  return [
    `${sitePath('/results')}?searchType=heavy`,
    `&vehicleGroupIds[value]=${encodeURIComponent(ENGINE_TYPE.groupId)}`,
    `&vehicleGroupIds[label]=${encodeURIComponent(ENGINE_TYPE.label)}`,
    `&heavyMfr[value]=${encodeURIComponent(v.mfrId)}`,
    `&heavyMfr[label]=${encodeURIComponent(v.mfrLabel)}`,
    `&heavyBase[value]=${encodeURIComponent(v.baseId)}`,
    `&heavyBase[label]=${encodeURIComponent(v.baseLabel)}`,
  ].join('');
}

/**
 * Enables the lookup link with a resolved URL, or disables it (no href, aria-disabled)
 * when the cascade is incomplete.
 */
export function setLookupHref(link, url) {
  if (url) {
    link.href = url;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
  } else {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('tabindex', '-1');
  }
}

/**
 * Builds and wires the Vehicle tab panel: an Application Type selector that switches
 * between the Year/Make/Model cascade (Car & Truck, Powersport) and the Vehicle type →
 * Manufacturer → Model → Year equipment cascade (everything else), each field loading
 * its options from the catalog API once the previous one is selected.
 * @param {Element} panel Empty tabpanel element to populate
 * @param {string} uid Block instance id, used to namespace child element ids
 * @param {string} lookupLabel Authored label for the "Look It Up" CTA
 * @param {{ defer?: boolean }} [options] When `defer` is true, skips the default Car & Truck
 *   auto-select/cascade on build — the caller (decorate()'s initial activation, or a
 *   `setSelection()` hydration) is responsible for triggering the first load instead.
 * @returns {{ activate: () => void, setSelection: (values: object) => Promise<void> }}
 */
export function buildVehiclePanel(panel, uid, lookupLabel, { defer = false } = {}) {
  panel.classList.add('parts-finder-panel-vehicle', 'is-ymm');
  panel.innerHTML = `
    <div class="parts-finder-field parts-finder-field-type"></div>
    <div class="parts-finder-field parts-finder-field-year parts-finder-field-ymm"></div>
    <div class="parts-finder-field parts-finder-field-make parts-finder-field-ymm"></div>
    <div class="parts-finder-field parts-finder-field-model parts-finder-field-ymm"></div>
    <div class="parts-finder-field parts-finder-field-vehicle-type parts-finder-field-equipment" hidden></div>
    <div class="parts-finder-field parts-finder-field-mfr parts-finder-field-equipment" hidden></div>
    <div class="parts-finder-field parts-finder-field-eq-model parts-finder-field-equipment" hidden></div>
    <div class="parts-finder-field parts-finder-field-eq-year parts-finder-field-equipment" hidden></div>
    <a href="#" class="parts-finder-lookup" aria-disabled="true" tabindex="-1"></a>
  `;
  panel.querySelector('.parts-finder-lookup').textContent = lookupLabel;

  const typeField = panel.querySelector('.parts-finder-field-type');
  const yearField = panel.querySelector('.parts-finder-field-year');
  const makeField = panel.querySelector('.parts-finder-field-make');
  const modelField = panel.querySelector('.parts-finder-field-model');
  const vehicleTypeField = panel.querySelector('.parts-finder-field-vehicle-type');
  const mfrField = panel.querySelector('.parts-finder-field-mfr');
  const eqModelField = panel.querySelector('.parts-finder-field-eq-model');
  const eqYearField = panel.querySelector('.parts-finder-field-eq-year');
  const lookupLink = panel.querySelector('.parts-finder-lookup');

  const typeDropdown = createDropdown({
    id: `${uid}-v-type`,
    label: t('applicationType'),
    placeholder: t('applicationType'),
  });
  const yearDropdown = createDropdown({ id: `${uid}-v-year`, label: t('year'), placeholder: t('year') });
  const makeDropdown = createDropdown({ id: `${uid}-v-make`, label: t('make'), placeholder: t('make') });
  const modelDropdown = createDropdown({ id: `${uid}-v-model`, label: t('model'), placeholder: t('model') });
  const vehicleTypeDropdown = createDropdown({
    id: `${uid}-v-vehicle-type`,
    label: t('vehicleType'),
    placeholder: t('vehicleType'),
  });
  const mfrDropdown = createDropdown({
    id: `${uid}-v-mfr`,
    label: t('manufacturer'),
    placeholder: t('manufacturer'),
  });
  const eqModelDropdown = createDropdown({
    id: `${uid}-v-eq-model`,
    label: t('model'),
    placeholder: t('model'),
  });
  const eqYearDropdown = createDropdown({
    id: `${uid}-v-eq-year`,
    label: t('year'),
    placeholder: t('year'),
  });

  typeField.append(typeDropdown.root);
  yearField.append(yearDropdown.root);
  makeField.append(makeDropdown.root);
  modelField.append(modelDropdown.root);
  vehicleTypeField.append(vehicleTypeDropdown.root);
  mfrField.append(mfrDropdown.root);
  eqModelField.append(eqModelDropdown.root);
  eqYearField.append(eqYearDropdown.root);

  const ymmFields = [yearField, makeField, modelField];
  const equipmentFields = [vehicleTypeField, mfrField, eqModelField, eqYearField];

  const setMode = (equipment) => {
    panel.classList.toggle('is-ymm', !equipment);
    panel.classList.toggle('is-equipment', equipment);
    ymmFields.forEach((field) => { field.hidden = equipment; });
    equipmentFields.forEach((field) => { field.hidden = !equipment; });
  };

  const resetYmmFields = () => {
    resetField(yearDropdown, t('year'));
    resetField(makeDropdown, t('make'));
    resetField(modelDropdown, t('model'));
  };

  const resetEquipmentFields = () => {
    resetField(vehicleTypeDropdown, t('vehicleType'));
    resetField(mfrDropdown, t('manufacturer'));
    resetField(eqModelDropdown, t('model'));
    resetField(eqYearDropdown, t('year'));
  };

  const updateLookup = () => {
    if (isYmmType(typeDropdown.value)) {
      if (yearDropdown.value && makeDropdown.value && modelDropdown.value) {
        setLookupHref(lookupLink, buildYmmResultsUrl({
          groupId: typeDropdown.value,
          typeLabel: typeDropdown.label,
          year: yearDropdown.value,
          makeId: makeDropdown.value,
          makeLabel: makeDropdown.label,
          modelId: modelDropdown.value,
          modelLabel: modelDropdown.label,
        }));
      } else {
        setLookupHref(lookupLink, null);
      }
      return;
    }

    if (vehicleTypeDropdown.value && mfrDropdown.value && eqModelDropdown.value) {
      setLookupHref(lookupLink, buildEquipmentResultsUrl({
        groupId: typeDropdown.value,
        typeLabel: typeDropdown.label,
        vehicleTypeId: vehicleTypeDropdown.value,
        vehicleTypeLabel: vehicleTypeDropdown.label,
        mfrId: mfrDropdown.value,
        mfrLabel: mfrDropdown.label,
        modelId: eqModelDropdown.value,
        modelLabel: eqModelDropdown.label,
        year: eqYearDropdown.value,
        yearLabel: eqYearDropdown.label,
      }));
    } else {
      setLookupHref(lookupLink, null);
    }
  };

  const loadYears = () => populateDropdown(
    yearDropdown,
    buildCatalogUrl('api.catalog.years', { vehicle_group_ids: typeDropdown.value }),
    (data) => data.years.map((y) => ({ value: String(y.id), label: y.value })),
    t('year'),
  );

  const loadMakes = () => populateDropdown(
    makeDropdown,
    buildCatalogUrl('api.catalog.makes', {
      vehicle_group_ids: typeDropdown.value,
      year_id: yearDropdown.value,
    }),
    (data) => data.makes.map((m) => ({ value: String(m.id), label: m.value })),
    t('make'),
  );

  const loadModels = () => populateDropdown(
    modelDropdown,
    buildCatalogUrl('api.catalog.models', {
      vehicle_group_ids: typeDropdown.value,
      year_id: yearDropdown.value,
      make_id: makeDropdown.value,
    }),
    (data) => data.models.map((m) => ({ value: String(m.id), label: m.value })),
    t('model'),
  );

  const loadVehicleTypes = () => populateDropdown(
    vehicleTypeDropdown,
    buildCatalogUrl('api.equipment.vehicle', {
      vehicle_group_ids: typeDropdown.value,
      brand_codes: '',
      own_brand: '',
    }),
    (data) => data.vehicle_types.map((vt) => ({ value: String(vt.id), label: vt.value })),
    t('vehicleType'),
  );

  const loadMfrs = () => populateDropdown(
    mfrDropdown,
    buildCatalogUrl('api.equipment.mfrs', { vehicle_type_id: vehicleTypeDropdown.value }),
    (data) => data.mfrs.map((m) => ({ value: String(m.id), label: m.value })),
    t('manufacturer'),
  );

  const loadEquipmentModels = () => populateDropdown(
    eqModelDropdown,
    buildCatalogUrl('api.equipment.models', {
      mfr_id: mfrDropdown.value,
      vehicle_type_id: vehicleTypeDropdown.value,
    }),
    (data) => data.equipment_models.map((m) => ({ value: String(m.id), label: m.value })),
    t('model'),
  );

  // Live site: when api.equipment.years returns [], show and auto-select
  // "All years" (no year[] params on the results URL). When years exist,
  // list them only — no "All years" option.
  const loadEquipmentYears = async () => {
    await populateDropdown(
      eqYearDropdown,
      buildCatalogUrl('api.equipment.years', {
        mfr_id: mfrDropdown.value,
        vehicle_type_id: vehicleTypeDropdown.value,
        equipment_model_id: eqModelDropdown.value,
      }),
      (data) => {
        const years = (data.years || []).map((y) => ({ value: String(y.id), label: y.value }));
        return years.length ? years : [{ value: '', label: t('allYears') }];
      },
      t('year'),
    );
    // Selects "All years" when present; no-op when real years were loaded.
    eqYearDropdown.setValue('');
    updateLookup();
  };

  const onTypeChange = () => {
    resetYmmFields();
    resetEquipmentFields();
    updateLookup();
    if (!typeDropdown.value) {
      setMode(false);
      return;
    }
    const equipment = !isYmmType(typeDropdown.value);
    setMode(equipment);
    if (equipment) loadVehicleTypes();
    else loadYears();
  };

  typeDropdown.setOptions(
    VEHICLE_TYPES.map((vt) => ({ value: vt.groupId, label: vt.label })),
    t('applicationType'),
  );
  typeDropdown.setDisabled(false);
  // Results toolbar passes defer:true then awaits setSelection so the
  // default Car & Truck cascade does not race / overwrite URL hydration.
  if (!defer) {
    typeDropdown.setValue(VEHICLE_TYPES[0].groupId);
    onTypeChange();
  }

  typeDropdown.onChange(onTypeChange);

  yearDropdown.onChange(() => {
    resetField(makeDropdown, t('make'));
    resetField(modelDropdown, t('model'));
    updateLookup();
    if (yearDropdown.value) loadMakes();
  });

  makeDropdown.onChange(() => {
    resetField(modelDropdown, t('model'));
    updateLookup();
    if (makeDropdown.value) loadModels();
  });

  modelDropdown.onChange(updateLookup);

  vehicleTypeDropdown.onChange(() => {
    resetField(mfrDropdown, t('manufacturer'));
    resetField(eqModelDropdown, t('model'));
    resetField(eqYearDropdown, t('year'));
    updateLookup();
    if (vehicleTypeDropdown.value) loadMfrs();
  });

  mfrDropdown.onChange(() => {
    resetField(eqModelDropdown, t('model'));
    resetField(eqYearDropdown, t('year'));
    updateLookup();
    if (mfrDropdown.value) loadEquipmentModels();
  });

  eqModelDropdown.onChange(() => {
    resetField(eqYearDropdown, t('year'));
    updateLookup();
    if (eqModelDropdown.value) loadEquipmentYears();
  });

  eqYearDropdown.onChange(updateLookup);

  return {
    activate: () => {
      typeDropdown.setOptions(
        VEHICLE_TYPES.map((vt) => ({ value: vt.groupId, label: vt.label })),
        t('applicationType'),
      );
      typeDropdown.setValue(VEHICLE_TYPES[0].groupId);
      typeDropdown.setDisabled(false);
      onTypeChange();
    },
    // Hydrates the panel from a prior Look It Up URL (YMM or equipment).
    setSelection: async ({
      typeValue,
      yearValue,
      makeValue,
      modelValue,
      vehicleValue,
      mfrValue,
      equipmentModelValue,
    }) => {
      typeDropdown.setOptions(VEHICLE_TYPES.map((vt) => ({ value: vt.groupId, label: vt.label })));
      const initialType = VEHICLE_TYPES.some((vt) => vt.groupId === typeValue)
        ? typeValue
        : VEHICLE_TYPES[0].groupId;
      typeDropdown.setValue(initialType);
      typeDropdown.setDisabled(false);

      const equipment = !isYmmType(initialType);
      setMode(equipment);
      resetYmmFields();
      resetEquipmentFields();
      updateLookup();

      if (equipment) {
        await loadVehicleTypes();
        if (vehicleValue) vehicleTypeDropdown.setValue(vehicleValue);
        if (vehicleTypeDropdown.value) {
          await loadMfrs();
          if (mfrValue) mfrDropdown.setValue(mfrValue);
        }
        if (mfrDropdown.value) {
          await loadEquipmentModels();
          if (equipmentModelValue) eqModelDropdown.setValue(equipmentModelValue);
        }
        if (eqModelDropdown.value) {
          await loadEquipmentYears();
          // loadEquipmentYears defaults to "All years"; restore a real year from the URL.
          if (yearValue) eqYearDropdown.setValue(yearValue);
        }
        updateLookup();
        return;
      }

      await loadYears();
      if (yearValue) yearDropdown.setValue(yearValue);
      if (yearDropdown.value) {
        await loadMakes();
        if (makeValue) makeDropdown.setValue(makeValue);
      }
      if (makeDropdown.value) {
        await loadModels();
        if (modelValue) modelDropdown.setValue(modelValue);
      }
      updateLookup();
    },
  };
}

/**
 * Builds and wires the Engine tab panel: a fixed Application Type (Heavy Duty/Industrial),
 * then a Manufacturer → Base cascade loaded from the catalog API.
 * @param {Element} panel Empty tabpanel element to populate
 * @param {string} uid Block instance id, used to namespace child element ids
 * @param {string} lookupLabel Authored label for the "Look It Up" CTA
 * @returns {{ activate: () => void, setSelection: (values: object) => Promise<void> }}
 */
export function buildEnginePanel(panel, uid, lookupLabel) {
  panel.classList.add('parts-finder-panel-engine');
  panel.innerHTML = `
    <div class="parts-finder-field parts-finder-field-type"></div>
    <div class="parts-finder-field parts-finder-field-mfr"></div>
    <div class="parts-finder-field parts-finder-field-base"></div>
    <a href="#" class="parts-finder-lookup" aria-disabled="true" tabindex="-1"></a>
  `;
  panel.querySelector('.parts-finder-lookup').textContent = lookupLabel;

  const typeField = panel.querySelector('.parts-finder-field-type');
  const mfrField = panel.querySelector('.parts-finder-field-mfr');
  const baseField = panel.querySelector('.parts-finder-field-base');
  const lookupLink = panel.querySelector('.parts-finder-lookup');

  // Live Engine tab: Application Type is a full dropdown with a single
  // authored option (Heavy Duty/Industrial), not plain static text.
  const typeDropdown = createDropdown({
    id: `${uid}-e-type`,
    label: t('applicationType'),
  });
  const mfrDropdown = createDropdown({
    id: `${uid}-e-mfr`,
    label: t('manufacturer'),
    placeholder: t('manufacturer'),
  });
  const baseDropdown = createDropdown({
    id: `${uid}-e-base`,
    label: t('base'),
    placeholder: t('base'),
  });

  typeField.append(typeDropdown.root);
  mfrField.append(mfrDropdown.root);
  baseField.append(baseDropdown.root);

  typeDropdown.setOptions([{ value: ENGINE_TYPE.groupId, label: ENGINE_TYPE.label }]);
  typeDropdown.setValue(ENGINE_TYPE.groupId);
  typeDropdown.setDisabled(false);
  mfrDropdown.setDisabled(true);
  baseDropdown.setDisabled(true);

  const updateLookup = () => {
    if (mfrDropdown.value && baseDropdown.value) {
      setLookupHref(lookupLink, buildEngineResultsUrl({
        mfrId: mfrDropdown.value,
        mfrLabel: mfrDropdown.label,
        baseId: baseDropdown.value,
        baseLabel: baseDropdown.label,
      }));
    } else {
      setLookupHref(lookupLink, null);
    }
  };

  const loadMfrs = () => populateDropdown(
    mfrDropdown,
    buildCatalogUrl('api.engine.heavyduty.mfrs', {
      vehicle_group_ids: ENGINE_TYPE.groupId,
      own_brand: 'corporate',
      brand_codes: 'brand',
    }),
    (data) => data.engine_mfrs.map((m) => ({ value: String(m.id), label: m.value })),
    t('manufacturer'),
  );

  const loadBases = () => populateDropdown(
    baseDropdown,
    buildCatalogUrl('api.engine.heavyduty.bases', {
      vehicle_group_ids: ENGINE_TYPE.groupId,
      engine_mfr_id: mfrDropdown.value,
      brand_codes: 'brand',
      own_brand: 'corporate',
    }),
    (data) => data.engine_bases.map((b) => ({ value: String(b.id), label: b.value })),
    t('base'),
  );

  mfrDropdown.onChange(() => {
    resetField(baseDropdown, t('base'));
    updateLookup();
    if (mfrDropdown.value) loadBases();
  });

  baseDropdown.onChange(updateLookup);

  return {
    activate: () => {
      typeDropdown.setOptions([{ value: ENGINE_TYPE.groupId, label: ENGINE_TYPE.label }]);
      typeDropdown.setValue(ENGINE_TYPE.groupId);
      typeDropdown.setDisabled(false);
      resetField(mfrDropdown, t('manufacturer'));
      resetField(baseDropdown, t('base'));
      updateLookup();
      loadMfrs();
    },
    // Hydrates the panel from a prior Engine Look It Up URL.
    setSelection: async ({ mfrValue, baseValue } = {}) => {
      typeDropdown.setOptions([{ value: ENGINE_TYPE.groupId, label: ENGINE_TYPE.label }]);
      typeDropdown.setValue(ENGINE_TYPE.groupId);
      typeDropdown.setDisabled(false);
      resetField(mfrDropdown, t('manufacturer'));
      resetField(baseDropdown, t('base'));
      updateLookup();
      await loadMfrs();
      if (mfrValue) mfrDropdown.setValue(mfrValue);
      if (mfrDropdown.value) {
        await loadBases();
        if (baseValue) baseDropdown.setValue(baseValue);
      }
      updateLookup();
    },
  };
}

/**
 * Reads authored text from a block row cell.
 * Prefers the value column (index 1) so an optional key column can document
 * the row for authors without affecting the UI. Falls back to a single-cell
 * row. Matching is positional — never by key label — so translation of keys
 * cannot break decoration.
 * @param {Element|undefined} row
 * @returns {string}
 */
function authoredValue(row) {
  if (!row) return '';
  const cells = [...row.children];
  const valueCell = cells.length > 1 ? cells[1] : cells[0];
  return valueCell?.textContent.trim() || '';
}

/**
 * Loads and decorates the block.
 * Authored rows (from DA), by position:
 * 1 title, 2–6 tab labels (Vehicle, Engine, Performance, VIN, Specification),
 * 7 lookup CTA label. Each row may be a single value cell, or key | value
 * (key is author-only and ignored). Matching is positional — never by key
 * label — so translation of keys cannot break decoration.
 * UI fallbacks for missing authored values come from `/placeholders.json`.
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  instanceCount += 1;
  const uid = `pf-${instanceCount}`;

  labels = { ...FALLBACK_LABELS, ...(await fetchPlaceholders(getPlaceholdersPrefix())) };

  const [
    headingRow,
    vehicleTabRow,
    engineTabRow,
    performanceTabRow,
    vinTabRow,
    specificationTabRow,
    lookupRow,
  ] = [...block.children];
  const heading = authoredValue(headingRow) || t('partsFinderTitle');
  const lookupLabel = authoredValue(lookupRow) || t('lookItUp');
  const tabDefs = [
    {
      id: 'vehicle',
      label: authoredValue(vehicleTabRow) || t('tabVehicle'),
      build: buildVehiclePanel,
    },
    {
      id: 'engine',
      label: authoredValue(engineTabRow) || t('tabEngine'),
      build: buildEnginePanel,
    },
    {
      id: 'performance',
      label: authoredValue(performanceTabRow) || t('tabPerformance'),
      disabled: true,
    },
    {
      id: 'vin',
      label: authoredValue(vinTabRow) || t('tabVin'),
      disabled: true,
    },
    {
      id: 'specification',
      label: authoredValue(specificationTabRow) || t('tabSpecification'),
      disabled: true,
    },
  ];
  block.textContent = '';

  const tabButtons = tabDefs.map((tab, index) => {
    if (tab.disabled) {
      return `<button type="button" role="tab" id="${uid}-tab-${tab.id}" class="parts-finder-tab is-disabled" disabled aria-disabled="true" tabindex="-1">${tab.label}</button>`;
    }
    return `<button type="button" role="tab" id="${uid}-tab-${tab.id}" aria-controls="${uid}-panel-${tab.id}" aria-selected="${index === 0}" class="parts-finder-tab">${tab.label}</button>`;
  }).join('');
  const panels = tabDefs.filter((tab) => !tab.disabled).map((tab, index) => (
    `<div class="parts-finder-panel" id="${uid}-panel-${tab.id}" role="tabpanel" aria-labelledby="${uid}-tab-${tab.id}"${index === 0 ? '' : ' hidden'}></div>`
  )).join('');

  block.innerHTML = `
    <div class="parts-finder-header">
      <p class="parts-finder-title">${heading}</p>
      <div class="parts-finder-tabs" role="tablist">
        ${tabButtons}
      </div>
    </div>
    ${panels}
  `;

  const tabs = tabDefs.filter((tab) => !tab.disabled).map((tab) => {
    const button = block.querySelector(`#${uid}-tab-${tab.id}`);
    const panel = block.querySelector(`#${uid}-panel-${tab.id}`);
    // defer: true — the initial activateTab() below is solely responsible for
    // triggering the default tab's first data load; without this, build()'s
    // own auto-init would fire the same catalog-api request a second time.
    const controller = tab.build(panel, uid, lookupLabel, { defer: true });
    return { button, panel, controller };
  });

  // Shows the given tab's panel and hides the rest, closing any open dropdown and
  // (re)triggering the newly-active panel's data load via its activate() callback.
  function activateTab(activeButton) {
    closeAllDropdowns();
    tabs.forEach(({ button, panel, controller }) => {
      const isActive = button === activeButton;
      button.setAttribute('aria-selected', String(isActive));
      panel.hidden = !isActive;
      if (isActive) controller.activate();
    });
  }

  tabs.forEach(({ button }) => {
    button.addEventListener('click', () => activateTab(button));
  });

  // This block sits in the page's first (eager) section, so decorate() runs
  // before LCP. The default tab's activate() call fetches from a second
  // origin (the catalog-api Worker) — push that off the eager critical path.
  const scheduleIdle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 0));
  scheduleIdle(() => activateTab(tabs[0].button));
}
