/**
 * Brand Detail block.
 *
 * Renders the shared DRiV brand page layout used across all
 * `/drivparts/brands/{slug}` pages. Authored as labeled rows:
 * Logo | Image | Heading | Body | Browse Parts? | Site Link? | Links?
 *
 * Source layout: https://www.drivparts.com/brands/*.html
 * (brand-navigation + header-hero + article).
 */

import { sitePath } from '../../../scripts/drivparts-paths.js';

const BECK_CATALOG_URL = 'http://www.beckcatalog.com/';
const STOREFRONT_CATEGORY_BASE = '/fmstorefront/federalmogul/en/USD/brands/c';

const BRAND_NAME_BY_SLUG = {
  abex: 'Abex',
  'beck-arnley': 'Beck/Arnley',
  champion: 'Champion',
  'fel-pro': 'Fel-Pro',
  ferodo: 'Ferodo',
  'fp-diesel': 'FP Diesel',
  jurid: 'Jurid',
  monroe: 'Monroe',
  moog: 'MOOG',
  national: 'National',
  'sealed-power': 'Sealed Power',
  'speed-pro': 'Speed Pro',
  wagner: 'Wagner',
  walker: 'Walker',
};

/**
 * Reads labeled rows while preserving the value cell's HTML.
 * @param {Element} block
 * @returns {Record<string, Element>}
 */
function readLabeledCells(block) {
  const cells = {};
  [...block.children].forEach((row) => {
    const [labelCell, valueCell] = row.children;
    if (!labelCell || !valueCell) return;
    const key = labelCell.textContent.trim().toLowerCase();
    if (!key) return;
    cells[key] = valueCell;
  });
  return cells;
}

/**
 * Brand display name for catalog query params, derived from the page path.
 * @param {string} [pathname]
 * @returns {string}
 */
export function brandNameFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/\/brands\/([^/?#]+)/i);
  if (!match) return '';
  const slug = match[1].replace(/\.html$/i, '').toLowerCase();
  if (BRAND_NAME_BY_SLUG[slug]) return BRAND_NAME_BY_SLUG[slug];
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Path segment for a Browse Parts category label.
 * Production drops ampersands: "Gaskets & Sealing Systems" → "Gaskets Sealing Systems".
 * @param {string} label
 * @returns {string}
 */
export function categoryPathSegment(label) {
  return encodeURIComponent(label.replace(/&/g, '').replace(/\s+/g, ' ').trim());
}

/**
 * Builds a legacy storefront (or Beck catalog) URL for a Browse Parts item.
 * @param {string} label
 * @param {string} brandName
 * @returns {string}
 */
export function browsePartsHref(label, brandName) {
  const trimmed = label.trim();
  if (/beck\/?\s*arnley\s+catalog/i.test(trimmed)) return BECK_CATALOG_URL;
  if (!brandName) return '#';
  const path = categoryPathSegment(trimmed);
  const query = encodeURIComponent(`:name-asc:brand:${brandName}`);
  return `${STOREFRONT_CATEGORY_BASE}/${path}?q=${query}&text=#`;
}

/**
 * Splits authored Browse Parts text into individual labels.
 * @param {string} text
 * @returns {string[]}
 */
export function parseBrowsePartsLabels(text) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Marks an anchor as an external destination when it leaves the current origin.
 * @param {HTMLAnchorElement} anchor
 */
function decorateExternalLink(anchor) {
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  } catch {
    // Invalid URL — leave as authored.
  }
}

/**
 * Moves a picture (or bare img) out of its authored cell.
 * @param {Element|undefined} cell
 * @returns {HTMLElement|null}
 */
function takePicture(cell) {
  if (!cell) return null;
  return cell.querySelector('picture') || cell.querySelector('img');
}

/**
 * Builds the logo + optional site-link sidebar brand chrome.
 * @param {Element|undefined} logoCell
 * @param {Element|undefined} siteCell
 * @returns {HTMLElement}
 */
function buildSidebarBrand(logoCell, siteCell) {
  const sidebarBrand = document.createElement('div');
  sidebarBrand.className = 'brand-detail-brand';

  const siteLink = siteCell?.querySelector('a[href]');
  const picture = takePicture(logoCell);

  if (picture) {
    if (siteLink) {
      const logoAnchor = document.createElement('a');
      logoAnchor.className = 'brand-detail-logo-link';
      logoAnchor.href = siteLink.href;
      decorateExternalLink(logoAnchor);
      const img = picture.querySelector('img') || picture;
      logoAnchor.setAttribute('aria-label', img.getAttribute('alt') || siteLink.textContent.trim() || 'Brand website');
      logoAnchor.append(picture);
      sidebarBrand.append(logoAnchor);
    } else {
      const logoWrap = document.createElement('div');
      logoWrap.className = 'brand-detail-logo';
      logoWrap.append(picture);
      sidebarBrand.append(logoWrap);
    }
  }

  if (siteLink) {
    const link = document.createElement('a');
    link.className = 'brand-detail-site-link';
    link.href = siteLink.href;
    link.textContent = siteLink.textContent.trim() || siteLink.href;
    decorateExternalLink(link);
    sidebarBrand.append(link);
  }

  return sidebarBrand;
}

/**
 * Builds the expandable Browse Parts list from authored labels.
 * @param {Element|undefined} browseCell
 * @param {string} brandName
 * @returns {HTMLElement|null}
 */
function buildBrowseParts(browseCell, brandName) {
  if (!browseCell) return null;
  const labels = parseBrowsePartsLabels(browseCell.textContent || '');
  if (!labels.length) return null;

  const root = document.createElement('div');
  root.className = 'brand-detail-browse';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'brand-detail-browse-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.textContent = 'Browse Parts';

  const list = document.createElement('ul');
  list.className = 'brand-detail-browse-list';

  labels.forEach((label) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = browsePartsHref(label, brandName);
    link.textContent = label;
    if (/^https?:\/\//i.test(link.href) || link.href.includes('beckcatalog.com')) {
      decorateExternalLink(link);
    }
    item.append(link);
    list.append(item);
  });

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    root.classList.toggle('is-collapsed', expanded);
  });

  root.append(toggle, list);
  return root;
}

/**
 * Builds the hero image region.
 * @param {Element|undefined} imageCell
 * @returns {HTMLElement|null}
 */
function buildHero(imageCell) {
  const picture = takePicture(imageCell);
  if (!picture) return null;
  const hero = document.createElement('div');
  hero.className = 'brand-detail-hero';
  hero.append(picture);
  return hero;
}

/**
 * Builds the article body: heading, rich text, optional extra links, back CTA.
 * @param {Element|undefined} headingCell
 * @param {Element|undefined} bodyCell
 * @param {Element|undefined} linksCell
 * @returns {HTMLElement}
 */
function buildArticle(headingCell, bodyCell, linksCell) {
  const article = document.createElement('div');
  article.className = 'brand-detail-article';

  const content = document.createElement('div');
  content.className = 'brand-detail-content';

  if (headingCell) {
    const heading = headingCell.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) content.append(heading);
    else if (headingCell.textContent.trim()) {
      const h1 = document.createElement('h1');
      h1.textContent = headingCell.textContent.trim();
      content.append(h1);
    }
  }

  if (bodyCell) {
    [...bodyCell.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
      content.append(node);
    });
  }

  if (linksCell) {
    const extras = document.createElement('div');
    extras.className = 'brand-detail-links';
    [...linksCell.children].forEach((child) => extras.append(child));
    if (!extras.children.length && linksCell.textContent.trim()) {
      extras.append(...linksCell.childNodes);
    }
    extras.querySelectorAll('a[href]').forEach(decorateExternalLink);
    if (extras.childNodes.length) content.append(extras);
  }

  article.append(content);

  const utilities = document.createElement('div');
  utilities.className = 'brand-detail-utilities';
  const back = document.createElement('a');
  back.className = 'brand-detail-back';
  back.href = sitePath('/brands');
  back.setAttribute('aria-label', 'Back to Brands');
  const backShort = document.createElement('span');
  backShort.className = 'brand-detail-back-short';
  backShort.setAttribute('aria-hidden', 'true');
  backShort.textContent = 'Back';
  const backFull = document.createElement('span');
  backFull.className = 'brand-detail-back-full';
  backFull.setAttribute('aria-hidden', 'true');
  backFull.textContent = 'Back to Brands';
  back.append(backShort, backFull);
  utilities.append(back);
  article.append(utilities);

  return article;
}

/**
 * @param {Element} block
 */
export default function decorate(block) {
  const cells = readLabeledCells(block);
  const brandName = brandNameFromPath();

  const layout = document.createElement('div');
  layout.className = 'brand-detail-layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'brand-detail-sidebar';
  sidebar.append(buildSidebarBrand(cells.logo, cells['site link']));
  const browse = buildBrowseParts(cells['browse parts'], brandName);
  if (browse) sidebar.append(browse);

  const main = document.createElement('div');
  main.className = 'brand-detail-main';
  const hero = buildHero(cells.image);
  if (hero) main.append(hero);
  main.append(buildArticle(cells.heading, cells.body, cells.links));

  layout.append(sidebar, main);
  block.replaceChildren(layout);

  const section = block.closest('.section');
  if (section) section.classList.add('brand-detail-section');
}
