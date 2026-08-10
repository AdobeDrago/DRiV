import { sitePath } from '../../../scripts/drivparts-paths.js';

const BECK_CATALOG_URL = 'http://www.beckcatalog.com/';
const STOREFRONT_CATEGORY_BASE = '/fmstorefront/federalmogul/en/USD/brands/c';
const BECK_ARNLEY_CATALOG_LABEL_RE = /beck\/?\s*arnley\s+catalog/i;
const ABSOLUTE_URL_RE = /^https?:\/\//i;
const BRAND_SLUG_FROM_PATH_RE = /\/brands\/([^/?#]+)/i;
const HTML_SUFFIX_RE = /\.html$/i;

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

// Reads the block's labeled rows into a { label: valueCell } map.
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

// Derives the brand display name (for catalog query params) from the current page's URL slug.
export function brandNameFromPath(pathname = window.location.pathname) {
  const match = pathname.match(BRAND_SLUG_FROM_PATH_RE);
  if (!match) return '';
  const slug = match[1].replace(HTML_SUFFIX_RE, '').toLowerCase();
  if (BRAND_NAME_BY_SLUG[slug]) return BRAND_NAME_BY_SLUG[slug];
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Path segment for a Browse Parts category label (production drops ampersands).
export function categoryPathSegment(label) {
  return encodeURIComponent(label.replace(/&/g, '').replace(/\s+/g, ' ').trim());
}

// Builds a legacy storefront (or Beck catalog) URL for a Browse Parts item.
export function browsePartsHref(label, brandName) {
  const trimmed = label.trim();
  if (BECK_ARNLEY_CATALOG_LABEL_RE.test(trimmed)) return BECK_CATALOG_URL;
  if (!brandName) return '#';
  const path = categoryPathSegment(trimmed);
  const query = encodeURIComponent(`:name-asc:brand:${brandName}`);
  return `${STOREFRONT_CATEGORY_BASE}/${path}?q=${query}&text=#`;
}

// Splits authored Browse Parts text (comma-separated) into individual labels.
export function parseBrowsePartsLabels(text) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

// Marks an anchor as an external destination when it leaves the current origin.
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

// Moves a picture (or bare img) out of its authored cell.
function takePicture(cell) {
  if (!cell) return null;
  return cell.querySelector('picture') || cell.querySelector('img');
}

// Builds the sidebar's logo + optional site-link chrome.
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

// Builds the expandable Browse Parts list from authored labels.
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
    if (ABSOLUTE_URL_RE.test(link.href)) decorateExternalLink(link);
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

// Builds the hero image region.
function buildHero(imageCell) {
  const picture = takePicture(imageCell);
  if (!picture) return null;
  const hero = document.createElement('div');
  hero.className = 'brand-detail-hero';
  hero.append(picture);
  return hero;
}

// Appends the heading (or a synthesized <h1> from plain text) to the article content.
function appendHeading(content, headingCell) {
  if (!headingCell) return;
  const heading = headingCell.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    content.append(heading);
  } else if (headingCell.textContent.trim()) {
    const h1 = document.createElement('h1');
    h1.textContent = headingCell.textContent.trim();
    content.append(h1);
  }
}

// Appends the rich-text body's nodes, skipping empty whitespace-only text nodes.
function appendBody(content, bodyCell) {
  if (!bodyCell) return;
  [...bodyCell.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
    content.append(node);
  });
}

// Appends any optional extra links, decorating external ones.
function appendExtraLinks(content, linksCell) {
  if (!linksCell) return;
  const extras = document.createElement('div');
  extras.className = 'brand-detail-links';
  [...linksCell.children].forEach((child) => extras.append(child));
  if (!extras.children.length && linksCell.textContent.trim()) {
    extras.append(...linksCell.childNodes);
  }
  extras.querySelectorAll('a[href]').forEach(decorateExternalLink);
  if (extras.childNodes.length) content.append(extras);
}

// Builds the "Back to Brands" link, with short/full-text spans swapped in by CSS per breakpoint.
function buildBackToBrandsLink() {
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
  return utilities;
}

// Builds the article body: heading, rich text, optional extra links, and the "Back" CTA.
function buildArticle(headingCell, bodyCell, linksCell) {
  const article = document.createElement('div');
  article.className = 'brand-detail-article';

  const content = document.createElement('div');
  content.className = 'brand-detail-content';
  appendHeading(content, headingCell);
  appendBody(content, bodyCell);
  appendExtraLinks(content, linksCell);

  article.append(content, buildBackToBrandsLink());
  return article;
}

// Builds the brand-detail layout: sidebar (logo/site-link/browse-parts) + main (hero/article).
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
