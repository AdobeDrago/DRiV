/**
 * Shared catalog helpers for drivparts blocks (finder, results, part-details, WTB).
 * API Worker URL + fetch, DAM image/logo resolution, and where-to-buy links.
 */

import { getLocaleConfig, sitePath } from './drivparts-paths.js';

/* --- Catalog API Worker --- */

export const CATALOG_API_BASE = 'https://moogparts-catalog-api.code-and-theory-adobe.workers.dev';

/**
 * Shared query params sent with every drivparts catalog-api request.
 * Locale and country follow the active URL locale folder.
 * @returns {{ brand: string, locale: string, country_code: string }}
 */
export function getCatalogParams() {
  const { code, country } = getLocaleConfig();
  return { brand: 'corporate', locale: code, country_code: country };
}

/** Snapshot of default (en-us) params for callers that expect a static object. */
export const CATALOG_PARAMS = { brand: 'corporate', locale: 'en_US', country_code: 'US' };

/** Builds a catalog-api URL for a passthrough endpoint, merging shared brand/locale params. */
export function buildCatalogUrl(endpoint, params = {}) {
  const usp = new URLSearchParams({ ...getCatalogParams(), ...params });
  return `${CATALOG_API_BASE}/drivparts/${endpoint}?${usp}`;
}

/**
 * Fetches JSON, normalizing network failures and non-2xx to `{ ok: false }`
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

/* --- DAM assets + brand logos --- */

export const DRIVPARTS_ASSET_BASE = 'https://www.drivparts.com';

// Catalog API often omits dam_assets.brandLogo — logos authored at this path
// (name paragraphs then images). Lookup by brandSlug() first word so product-line
// variants share one logo; only the first image after a name paragraph is used.
const BRAND_LOGOS_PATH = () => sitePath('/shared-logos');

let brandLogoMapPromise = null;

export function resolveImageUrl(url) {
  if (!url) return null;
  return url.startsWith('/') ? `${DRIVPARTS_ASSET_BASE}${url}` : url;
}

export function brandSlug(brandName) {
  const rootBrand = (brandName || '').trim().split(/\s+/)[0];
  return rootBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Same "first word" extraction as brandSlug(), but case-preserved — the where-to-buy
// page's brand filter expects a display name (e.g. "Wagner"), not a lowercased slug.
export function brandRootWord(brandName) {
  return (brandName || '').trim().split(/\s+/)[0] || '';
}

/**
 * Matches the hash format the where-to-buy-result block already reads.
 * @param {'install' | 'store'} locType
 * @param {string} brandName
 * @param {{ country?: string }} [options]
 */
export function whereToBuyUrl(locType, brandName, { country } = {}) {
  const params = new URLSearchParams({
    dealerType: 'physical',
    locType,
    country: country || getLocaleConfig().country,
    partType: 'any',
    subBrand: brandRootWord(brandName) || 'all',
  });
  return `${sitePath('/where-to-buy')}#${params}`;
}

export function brandLogoUrl(brandName, brandLogoMap) {
  return brandLogoMap?.[brandSlug(brandName)] || null;
}

export function findDesc(descriptions, typeCode) {
  return descriptions?.find((d) => d.type_code === typeCode);
}

/** Contents for a description type_code (e.g. MKT, FAB), as plain strings. */
export function getDescriptionContents(product, typeCode) {
  const entry = findDesc(product?.descriptions, typeCode);
  return (entry?.contents || []).map((c) => c.content).filter(Boolean);
}

/** Fetched once and cached across blocks that import this module. */
export function fetchBrandLogoMap() {
  if (!brandLogoMapPromise) {
    brandLogoMapPromise = fetch(`${BRAND_LOGOS_PATH()}.plain.html`)
      .then(async (res) => {
        if (!res.ok) return {};
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const map = {};
        let currentSlug = null;
        doc.querySelectorAll('p').forEach((p) => {
          const img = p.querySelector('img');
          if (img) {
            if (currentSlug && !(currentSlug in map)) {
              map[currentSlug] = new URL(img.getAttribute('src'), res.url).href;
            }
            return;
          }
          const text = p.textContent.trim();
          currentSlug = text ? brandSlug(text) : null;
        });
        return map;
      })
      .catch(() => ({}));
  }
  return brandLogoMapPromise;
}
