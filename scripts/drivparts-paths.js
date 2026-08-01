/** Content root for DriveParts pages in the shared DRiV/DA tree. */
export const DRIVPARTS_ROOT = '/drivparts';

/**
 * True when the current (or given) path is under the DriveParts content tree.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isDrivpartsPath(pathname = window.location.pathname) {
  return pathname === DRIVPARTS_ROOT || pathname.startsWith(`${DRIVPARTS_ROOT}/`);
}

/**
 * Prefixes a site-relative path with `/drivparts` when serving under that tree.
 * Absolute http(s) URLs and paths already under `/drivparts` are returned unchanged.
 * @param {string} path
 * @returns {string}
 */
export function sitePath(path) {
  if (!path) return isDrivpartsPath() ? DRIVPARTS_ROOT : '/';
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!isDrivpartsPath()) return normalized;
  if (normalized === DRIVPARTS_ROOT || normalized.startsWith(`${DRIVPARTS_ROOT}/`)) {
    return normalized;
  }
  if (normalized === '/') return DRIVPARTS_ROOT;
  return `${DRIVPARTS_ROOT}${normalized}`;
}
