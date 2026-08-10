/** Content root for DriveParts pages in the shared DRiV/DA tree. */
export const DRIVPARTS_ROOT = '/drivparts';

/** Default locale when the path is under `/drivparts` but has no locale segment. */
export const DEFAULT_LOCALE_SLUG = 'en-us';

/**
 * Known DriveParts locale folders and their catalog / country codes.
 * @type {Record<string, { code: string, country: string }>}
 */
export const LOCALE_CONFIG = {
  'en-us': { code: 'en_US', country: 'US' },
  'es-mx': { code: 'es_MX', country: 'MX' },
};

/**
 * True when the current (or given) path is under the DriveParts content tree.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isDrivpartsPath(pathname = window.location.pathname) {
  return pathname === DRIVPARTS_ROOT || pathname.startsWith(`${DRIVPARTS_ROOT}/`);
}

/**
 * Locale folder slug from a pathname (`en-us`, `es-mx`), or the default when
 * under `/drivparts` without a locale segment. Empty string outside DriveParts.
 * @param {string} [pathname]
 * @returns {string}
 */
export function getLocaleSlug(pathname = window.location.pathname) {
  if (!isDrivpartsPath(pathname)) return '';
  const rest = pathname.slice(DRIVPARTS_ROOT.length).replace(/^\//, '');
  const [first] = rest.split('/');
  if (first && LOCALE_CONFIG[first]) return first;
  return DEFAULT_LOCALE_SLUG;
}

/**
 * Locale config for the active (or given) path.
 * @param {string} [pathname]
 * @returns {{ code: string, country: string }}
 */
export function getLocaleConfig(pathname = window.location.pathname) {
  const slug = getLocaleSlug(pathname) || DEFAULT_LOCALE_SLUG;
  return LOCALE_CONFIG[slug] || LOCALE_CONFIG[DEFAULT_LOCALE_SLUG];
}

/**
 * Content prefix for the active locale, e.g. `/drivparts/en-us`.
 * Outside DriveParts returns `''`.
 * @param {string} [pathname]
 * @returns {string}
 */
export function getLocalePrefix(pathname = window.location.pathname) {
  if (!isDrivpartsPath(pathname)) return '';
  return `${DRIVPARTS_ROOT}/${getLocaleSlug(pathname)}`;
}

/**
 * True when `path` is already under a known locale prefix.
 * @param {string} path
 * @returns {boolean}
 */
function hasLocalePrefix(path) {
  return Object.keys(LOCALE_CONFIG).some(
    (slug) => path === `${DRIVPARTS_ROOT}/${slug}`
      || path.startsWith(`${DRIVPARTS_ROOT}/${slug}/`),
  );
}

/**
 * Prefixes a site-relative path with the active DriveParts locale prefix.
 * Absolute http(s) URLs and paths already under a locale folder are unchanged.
 * @param {string} path
 * @returns {string}
 */
export function sitePath(path) {
  if (!isDrivpartsPath()) {
    if (!path) return '/';
    if (/^https?:\/\//i.test(path)) return path;
    return path.startsWith('/') ? path : `/${path}`;
  }

  const prefix = getLocalePrefix();
  if (!path) return prefix;
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (hasLocalePrefix(normalized)) return normalized;
  if (normalized === DRIVPARTS_ROOT || normalized.startsWith(`${DRIVPARTS_ROOT}/`)) {
    return normalized;
  }
  if (normalized === '/') return `${prefix}/`;
  return `${prefix}${normalized}`;
}
