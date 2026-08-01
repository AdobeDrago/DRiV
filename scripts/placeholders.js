import { toCamelCase } from './aem.js';

/**
 * Normalizes placeholder sheet JSON into row objects.
 * Supports single-sheet (`data: [...]`) and DA multi-sheet with a `data` tab
 * (`data: { data: [...] }`).
 * @param {object} json
 * @returns {object[]}
 */
function getPlaceholderRows(json) {
  if (!json || typeof json !== 'object') return [];
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.data?.data)) return json.data.data;
  if (json[':type'] === 'multi-sheet' && Array.isArray(json[':names'])) {
    const name = json[':names'].find((n) => Array.isArray(json[n]?.data)) || json[':names'][0];
    return json[name]?.data || [];
  }
  return [];
}

/**
 * Turns a sheet Key into a stable JS property name.
 * Keys that are already camelCase identifiers (e.g. `applicationType`) are
 * kept as-is — `toCamelCase` would lowercase them to `applicationtype`.
 * Spaced / dashed keys (e.g. `Application Type`) still go through toCamelCase.
 * @param {string} name
 * @returns {string}
 */
function placeholderKey(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed)) return trimmed;
  return toCamelCase(trimmed);
}

/**
 * Folder that owns placeholders for the current page.
 * `/` → root `/placeholders.json`
 * `/test/en` → `/test/en/placeholders.json`
 */
export function getPlaceholdersPrefix(pathname = window.location.pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return 'default';
  return path;
}

/**
 * Loads site placeholders from `/placeholders.json` (or `/{prefix}/placeholders.json`).
 * Keys are camelCased for property access (e.g. `tabVehicle`).
 * @param {string} [prefix='default'] Location prefix; `default` = site root
 * @returns {Promise<Record<string, string>>}
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => (resp.ok ? resp.json() : {}))
        .then((json) => {
          const placeholders = {};
          getPlaceholderRows(json)
            .filter((row) => row.Key || row.key)
            .forEach((row) => {
              const key = placeholderKey(row.Key || row.key);
              if (!key) return;
              placeholders[key] = row.Text ?? row.text ?? '';
            });
          window.placeholders[prefix] = placeholders;
          resolve(placeholders);
        })
        .catch(() => {
          window.placeholders[prefix] = {};
          resolve({});
        });
    });
  }
  return window.placeholders[prefix];
}
