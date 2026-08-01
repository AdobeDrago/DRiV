import { sitePath } from '../../../scripts/drivparts-paths.js';

// Not a statically imported dependency — the parts-list block (and its CSS)
// is fetched on demand via loadPartsList() below, the first time a shopper
// actually clicks "Add To Parts List", the same dynamic-import pattern
// scripts.js uses for the fragment block.
function loadPartsList() {
  return import('../parts-list/parts-list.js');
}

const DESKTOP_QUERY = '(width >= 1025px)';

const WORKER_BASE = 'https://moogparts-catalog-api.atul-code-auth0.workers.dev';
const API_BASE = `${WORKER_BASE}/drivparts`;
const DRIVPARTS_ASSET_BASE = 'https://www.drivparts.com';
const API_PARAMS = { brand: 'corporate', locale: 'en_US', country_code: 'US' };

function resolveImageUrl(url) {
  if (!url) return null;
  return url.startsWith('/') ? `${DRIVPARTS_ASSET_BASE}${url}` : url;
}

function findDesc(descriptions, typeCode) {
  return descriptions?.find((d) => d.type_code === typeCode);
}

// The catalog API never returns dam_assets.brandLogo, so brand logos are authored
// on a dedicated page (see BRAND_LOGOS_PATH) — plain paragraphs alternating a brand
// name (or several, e.g. "Wagner Brake / Wagner HVAC / ...") and one or more logo
// images. Fetched once and cached. product.brand_name is looked up by its root word
// (e.g. "Champion Spark Plug" → "champion") since one logo covers all of a brand's
// product-line variants — a name paragraph is only ever matched against its FIRST
// following image; that's sufficient because brandSlug() only keeps the first word,
// so every name in a grouped "X / Y / Z" row already collapses to the same slug.
const BRAND_LOGOS_PATH = () => sitePath('/shared-logos');

function brandSlug(brandName) {
  const rootBrand = (brandName || '').trim().split(/\s+/)[0];
  return rootBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Kick off preconnects for every domain this block contacts so the browser
// can open sockets before the API calls are made.
function injectPreconnects() {
  const { head } = document;
  [
    { href: WORKER_BASE },
    { href: DRIVPARTS_ASSET_BASE, crossorigin: true },
  ].forEach(({ href, crossorigin: needsCrossOrigin }) => {
    if (head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    if (needsCrossOrigin) link.crossOrigin = '';
    head.prepend(link);
  });
}

// Cache for the product API promise so load() just awaits an in-progress request.
// Initialised at the bottom of the module (after all functions are defined) so
// the eager fetch begins as early as possible without triggering no-use-before-define.
let partDetailsPromise = null;

// Inject a <link rel="preload"> for the LCP image as soon as its URL is known
// (immediately after the API resolves, before any DOM is built).
function preloadLCPImage(url) {
  if (!url) return;
  const { head } = document;
  if (head.querySelector(`link[rel="preload"][href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  link.fetchPriority = 'high';
  head.prepend(link);
}

// Start fetching the brand-logo map immediately when this module is imported
// (not deferred until decorate() runs) so it is in-flight while the block
// renders its loading skeleton.
let brandLogoMapPromise = null;

function fetchBrandLogoMap() {
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

async function fetchPartDetails(partNumber, brandCode) {
  const params = {
    ...API_PARAMS,
    part_number: partNumber,
    brand_code: brandCode,
    brand_codes: brandCode,
  };
  const makeUrl = (endpoint) => {
    const url = new URL(`${API_BASE}/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  };
  const [productRes, appsRes] = await Promise.all([
    fetch(makeUrl('api.catalog.product')),
    fetch(makeUrl('api.catalog.applications')),
  ]);
  if (!productRes.ok) throw new Error(`Product API failed: ${productRes.status}`);
  if (!appsRes.ok) throw new Error(`Applications API failed: ${appsRes.status}`);
  return Promise.all([productRes.json(), appsRes.json()]);
}

function buildGallery(primaries, thumbnails) {
  const gallery = document.createElement('div');
  gallery.className = 'pd-gallery';

  const thumbMap = Object.fromEntries(thumbnails.map((t) => [t.index, resolveImageUrl(t.url)]));
  const pairs = primaries
    .map((p) => ({
      mainUrl: resolveImageUrl(p.url),
      thumbUrl: thumbMap[p.index] || resolveImageUrl(p.url),
    }))
    .filter((p) => p.mainUrl);

  pairs.slice(1).forEach(({ mainUrl }) => {
    const preloadImg = new Image();
    preloadImg.decoding = 'async';
    preloadImg.src = mainUrl;
  });

  const mainImg = document.createElement('img');
  mainImg.className = 'pd-main-image';
  mainImg.alt = '';
  mainImg.decoding = 'async';
  mainImg.fetchPriority = 'high';
  mainImg.width = 600;
  mainImg.height = 600;
  if (pairs[0]) mainImg.src = pairs[0].mainUrl;

  let currentIndex = 0;

  const thumbEls = [];
  const dotEls = [];

  function activate(index) {
    if (!pairs.length) return;
    currentIndex = (index + pairs.length) % pairs.length;
    mainImg.src = pairs[currentIndex].mainUrl;
    thumbEls.forEach((t, i) => {
      const isActive = i === currentIndex;
      t.classList.toggle('pd-thumbnail-active', isActive);
      t.setAttribute('aria-current', isActive ? 'true' : 'false');
      t.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    dotEls.forEach((d, i) => {
      const isActive = i === currentIndex;
      d.classList.toggle('pd-gallery-dot-active', isActive);
      d.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
    // Scroll the thumbnail strip so the newly active one is visible — the strip
    // overflows horizontally once there are more thumbnails than fit, and the
    // prev/next arrows otherwise leave the active thumbnail scrolled out of view.
    thumbEls[currentIndex].scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }

  function showPrevious() {
    activate(currentIndex - 1);
  }

  function showNext() {
    activate(currentIndex + 1);
  }

  let galleryMainEl = mainImg;
  if (pairs.length > 1) {
    const mainImgBtn = document.createElement('button');
    mainImgBtn.type = 'button';
    mainImgBtn.className = 'pd-main-image-btn';
    mainImgBtn.setAttribute('aria-label', 'Show next product image');
    mainImgBtn.append(mainImg);
    galleryMainEl = mainImgBtn;
  }

  const navEl = document.createElement('div');
  navEl.className = 'pd-gallery-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'pd-gallery-arrow';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.textContent = '◄';
  prevBtn.disabled = pairs.length <= 4;
  prevBtn.hidden = pairs.length <= 4;
  prevBtn.dataset.galleryAction = 'previous';

  const thumbsEl = document.createElement('div');
  thumbsEl.className = 'pd-thumbnails';

  pairs.forEach(({ thumbUrl }, i) => {
    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'pd-thumbnail-btn';
    thumbBtn.setAttribute('aria-label', `Show product image ${i + 1}`);
    thumbBtn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    thumbBtn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    thumbBtn.dataset.galleryIndex = String(i);
    if (i === 0) thumbBtn.classList.add('pd-thumbnail-active');

    const thumb = document.createElement('img');
    thumb.src = thumbUrl;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.className = 'pd-thumbnail';
    thumb.width = 64;
    thumb.height = 64;

    thumbBtn.append(thumb);
    thumbEls.push(thumbBtn);
    thumbsEl.appendChild(thumbBtn);
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'pd-gallery-arrow';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.textContent = '►';
  nextBtn.disabled = pairs.length <= 4;
  nextBtn.hidden = pairs.length <= 4;
  nextBtn.dataset.galleryAction = 'next';

  // Dot pagination — mirrors the source drivparts.com mobile gallery, which
  // replaces the thumbnail strip and arrows with dots (see pd-gallery-nav /
  // pd-gallery-dots visibility toggles in the CSS).
  const dotsEl = document.createElement('div');
  dotsEl.className = 'pd-gallery-dots';
  dotsEl.hidden = pairs.length <= 1;
  pairs.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'pd-gallery-dot';
    dot.setAttribute('aria-label', `Show product image ${i + 1}`);
    dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    dot.dataset.galleryIndex = String(i);
    if (i === 0) dot.classList.add('pd-gallery-dot-active');
    dotEls.push(dot);
    dotsEl.appendChild(dot);
  });

  gallery.addEventListener('click', (e) => {
    const arrow = e.target.closest('.pd-gallery-arrow');
    if (arrow && gallery.contains(arrow)) {
      if (arrow.dataset.galleryAction === 'previous') showPrevious();
      if (arrow.dataset.galleryAction === 'next') showNext();
      return;
    }

    const thumbBtn = e.target.closest('.pd-thumbnail-btn');
    if (thumbBtn && gallery.contains(thumbBtn)) {
      activate(Number(thumbBtn.dataset.galleryIndex));
      return;
    }

    const dotBtn = e.target.closest('.pd-gallery-dot');
    if (dotBtn && gallery.contains(dotBtn)) {
      activate(Number(dotBtn.dataset.galleryIndex));
      return;
    }

    if (e.target.closest('.pd-main-image') || e.target.closest('.pd-main-image-btn')) showNext();
  });

  gallery.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showPrevious();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      showNext();
      return;
    }

    if (e.key !== 'Enter' && e.key !== ' ') return;

    const thumbBtn = e.target.closest('.pd-thumbnail-btn');
    if (thumbBtn && gallery.contains(thumbBtn)) {
      e.preventDefault();
      activate(Number(thumbBtn.dataset.galleryIndex));
      return;
    }

    if (e.target.closest('.pd-main-image') || e.target.closest('.pd-main-image-btn')) {
      e.preventDefault();
      showNext();
    }
  });

  navEl.append(prevBtn, thumbsEl, nextBtn);
  gallery.append(galleryMainEl, navEl, dotsEl);
  return gallery;
}

// CTAs mirror the source layout (Get It Installed / Where To Buy /
// Add To Parts List). "Add To Parts List" adds the current part to the shared
// parts-list store (see blocks/drivparts/parts-list/parts-list.js) and turns into "View
// My Part List", which opens the "MY PARTS LIST" modal on a second click.
/**
 * @param {object} product
 * @param {string} [brandCode] Hybris manufacturer code from the URL (e.g. BBGB)
 */
function buildActions(product, brandCode = '') {
  const actions = document.createElement('div');
  actions.className = 'pd-actions';

  const installBtn = document.createElement('a');
  installBtn.className = 'pd-action-install';
  installBtn.href = '#';
  installBtn.textContent = 'Get It Installed';

  const buyBtn = document.createElement('a');
  buyBtn.className = 'pd-action-buy';
  buyBtn.href = '#';
  buyBtn.textContent = 'Where To Buy';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'button primary pd-action-add';
  addBtn.textContent = 'Add To Parts List';

  // The parts-list block isn't loaded yet at this point (see loadPartsList),
  // so the button can't know its real label until that import resolves.
  loadPartsList().then(({ isInPartsList, onPartsListChange }) => {
    const refreshAddBtnLabel = () => {
      const inList = isInPartsList(product.brand_name, product.part_number);
      addBtn.textContent = inList ? 'View My Part List' : 'Add To Parts List';
    };
    refreshAddBtnLabel();

    // Also react to changes made from inside the modal itself (e.g. removing
    // this same part), so the CTA doesn't keep showing "View My Part List"
    // for a part that's no longer on the list.
    onPartsListChange(refreshAddBtnLabel);
  });

  addBtn.addEventListener('click', async () => {
    const { addToPartsList, isInPartsList, openPartsListModal } = await loadPartsList();
    if (isInPartsList(product.brand_name, product.part_number)) {
      openPartsListModal();
      return;
    }
    const shortDesc = findDesc(product.descriptions, 'SHO');
    // QA filterPartDetailObj: brand_code from hybris_brand_code only — not catalog brand.
    const cartBrandCode = product.hybris_brand_code || '';
    const rawImageUrl = product.dam_assets?.productPrimaries?.[0]?.url || '';
    addToPartsList({
      id: product.id || `${product.part_number}-${cartBrandCode || product.brand || brandCode || ''}`,
      brand: product.brand_name,
      partNumber: product.part_number,
      description: product.part_type || shortDesc?.contents?.[0]?.content || '',
      brandCode: cartBrandCode,
      // QA posts relative /bin/fmmp or /content/dam paths only — not absolute URLs.
      imageUrl: rawImageUrl.startsWith('/') ? rawImageUrl : '',
      qty: 1,
    });
    addBtn.textContent = 'View My Part List';
  });

  actions.append(installBtn, buyBtn, addBtn);
  return actions;
}

function getDescriptionContent(product) {
  const mktDesc = findDesc(product.descriptions, 'MKT');
  const descText = mktDesc?.contents?.[0]?.content || '';
  const fabDesc = findDesc(product.descriptions, 'FAB');
  const features = (fabDesc?.contents || []).map(({ content }) => content);
  return { descText, features };
}

// Mobile shows Description as an accordion panel alongside Specifications and
// Applications (see buildTabs); desktop shows it inline in the info column
// instead (see buildInfo). Built from the same source data, not shared DOM
// nodes, since the two layouts render at the same time and only one is visible.
function buildDescriptionPanel(product) {
  const { descText, features } = getDescriptionContent(product);
  const panel = document.createElement('div');
  panel.className = 'pd-description-panel';

  const descEl = document.createElement('p');
  descEl.className = 'pd-description';
  descEl.textContent = descText;

  const featuresEl = document.createElement('ul');
  featuresEl.className = 'pd-features';
  features.forEach((content) => {
    const li = document.createElement('li');
    li.textContent = content;
    featuresEl.appendChild(li);
  });

  panel.append(descEl, featuresEl);
  return panel;
}

/**
 * @param {object} product
 * @param {Record<string, string>} brandLogoMap
 * @param {string} [brandCode]
 */
function buildInfo(product, brandLogoMap, brandCode = '') {
  const info = document.createElement('div');
  info.className = 'pd-info';

  // ── Header: brand logo (left) + part name / number (right) ──────────────
  const header = document.createElement('div');
  header.className = 'pd-header';

  const apiLogoUrl = resolveImageUrl(product.dam_assets?.brandLogo?.[0]?.url);
  const logoUrl = apiLogoUrl || brandLogoMap[brandSlug(product.brand_name)] || null;
  if (logoUrl) {
    const logoImg = document.createElement('img');
    logoImg.className = 'pd-brand-logo';
    logoImg.src = logoUrl;
    logoImg.alt = product.brand_name || '';
    logoImg.width = 130;
    logoImg.height = 70;
    logoImg.loading = 'lazy';
    logoImg.decoding = 'async';
    logoImg.addEventListener('error', () => {
      const brandEl = document.createElement('p');
      brandEl.className = 'pd-brand-name';
      brandEl.textContent = product.brand_name || '';
      logoImg.replaceWith(brandEl);
    }, { once: true });
    header.append(logoImg);
  } else {
    const brandEl = document.createElement('p');
    brandEl.className = 'pd-brand-name';
    brandEl.textContent = product.brand_name || '';
    header.append(brandEl);
  }

  const identity = document.createElement('div');
  identity.className = 'pd-identity';

  const nameEl = document.createElement('h1');
  nameEl.className = 'pd-part-name';
  const shortDesc = findDesc(product.descriptions, 'SHO');
  nameEl.textContent = product.part_type || shortDesc?.contents?.[0]?.content || product.title || '';

  const numberEl = document.createElement('p');
  numberEl.className = 'pd-part-number';
  numberEl.innerHTML = '<span class="pd-part-number-label">Part Number:</span> '
    + `<span class="pd-part-number-value">${product.part_number}</span>`;

  identity.append(nameEl, numberEl);
  header.append(identity);

  // ── Divider ──────────────────────────────────────────────────────────────
  const divider = document.createElement('hr');
  divider.className = 'pd-divider';

  // ── CTAs ─────────────────────────────────────────────────────────────────
  const actions = buildActions(product, brandCode);

  // ── Description / features ───────────────────────────────────────────────
  const { descText, features } = getDescriptionContent(product);
  const descEl = document.createElement('p');
  descEl.className = 'pd-description';
  descEl.textContent = descText;

  const featuresEl = document.createElement('ul');
  featuresEl.className = 'pd-features';
  features.forEach((content) => {
    const li = document.createElement('li');
    li.textContent = content;
    featuresEl.appendChild(li);
  });

  info.append(header, divider, actions, descEl, featuresEl);
  return info;
}

function buildSpecsTable(attributes, partType) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pd-specs-wrapper';
  const table = document.createElement('table');
  table.className = 'pd-specs-table';
  const tbody = document.createElement('tbody');

  // The API never groups individual attributes, but the reference site always
  // shows one section header above the spec list: "{part type} Dimensions".
  if ((attributes || []).length && partType) {
    const groupTr = document.createElement('tr');
    groupTr.className = 'pd-specs-group-row';
    const groupTd = document.createElement('td');
    groupTd.colSpan = 2;
    groupTd.textContent = `${partType} Dimensions`;
    groupTr.appendChild(groupTd);
    tbody.appendChild(groupTr);
  }

  let dataRowCount = 0;

  (attributes || []).forEach((attr) => {
    // Alternate shading independently of the group-header row
    const tr = document.createElement('tr');
    tr.className = `pd-specs-data-row${dataRowCount % 2 === 0 ? ' pd-specs-row-shaded' : ''}`;
    dataRowCount += 1;

    const tdName = document.createElement('td');
    tdName.textContent = attr.attribute;
    const tdVal = document.createElement('td');
    tdVal.textContent = attr.attribute_uom
      ? `${attr.attribute_value} ${attr.attribute_uom}`
      : attr.attribute_value;
    tr.append(tdName, tdVal);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// Some application categories (Powersport, Passenger Car & Light Truck) key vehicle
// fit by make/model; others (Small Engine, Performance Engine, Commercial/Industrial
// & Ag, Marine Application) key it by equipment manufacturer/model instead.
const getMake = (app) => app.make?.value || app.mfr?.value || '';
const getModel = (app) => app.model?.value || app.equipment_model?.value || '';
const getYearRange = (app) => {
  const y = app.years || [];
  return y.length ? `${Math.min(...y)}–${Math.max(...y)}` : '';
};
const getDescription = (app) => app.category?.part_type_value || '';
const getPosition = (app) => app.position?.value || '';
const getDriveWheel = (app) => app.drive?.value || '';
const getQty = (app) => app.qty ?? '';
const getEngineBase = (app) => app.engine_base_value || '';
// engine_vin.value is almost always "-" (no data); engine_version_value (a bore
// description) is a different field the reference site never shows in this column.
const getEngineVin = (app) => {
  const v = app.engine_vin?.value;
  return v && v !== '-' ? v : '';
};
const getEngineDesg = (app) => app.engine_designation?.value || '';

const APP_COLUMNS = [
  { label: 'Make', get: getMake },
  { label: 'Model', get: getModel },
  { label: 'Year Range', get: getYearRange },
  { label: 'Description', get: getDescription },
  { label: 'Position', get: getPosition },
  { label: 'Drive Wheel', get: getDriveWheel },
  { label: 'Veh. Qty.', get: getQty },
  { label: 'Engine Base', get: getEngineBase },
  { label: 'Engine VIN', get: getEngineVin },
];

// Performance Engine applications key their equipment by mfr/equipment_model like
// other equipment categories, but the reference site never shows mfr as "Make" here
// (that's the engine's manufacturer, not a vehicle make) — so no mfr fallback.
const PERFORMANCE_APP_COLUMNS = [
  { label: 'Make', get: (app) => app.make?.value || '' },
  ...APP_COLUMNS.slice(1),
  { label: 'Engine Desg.', get: getEngineDesg },
];

// Categories rendered as a simple, header-less list of the columns relevant to
// that equipment type (matches the drivparts.com reference layout).
const SIMPLE_GROUP_COLUMNS = {
  POWERSPORT: [{ get: getMake }, { get: getModel }, { get: getYearRange, fallback: '—' }],
  'SMALL ENGINE': [{ get: getMake }, { get: getModel }],
  'COMMERCIAL, INDUSTRIAL & AG': [{ get: getMake }, { get: getModel }, { get: getYearRange, fallback: '—' }],
  'MARINE APPLICATION': [{ get: getMake }, { get: getModel }, { get: getEngineBase, fallback: '—' }],
};

// Order and display labels for the Applications sub-tabs, matching drivparts.com.
const TAB_ORDER = [
  'PASSENGER CAR & LIGHT TRUCK',
  'COMMERCIAL, INDUSTRIAL & AG',
  'POWERSPORT',
  'SMALL ENGINE',
  'MARINE APPLICATION',
  'PERFORMANCE ENGINE',
];

const TAB_LABELS = {
  'PASSENGER CAR & LIGHT TRUCK': 'Passenger Car & Light Truck',
  'COMMERCIAL, INDUSTRIAL & AG': 'Commercial, Industrial & AG.',
  POWERSPORT: 'Powersport',
  'SMALL ENGINE': 'Small Engine',
  'MARINE APPLICATION': 'Marine Applications',
  'PERFORMANCE ENGINE': 'Performance',
};

function buildAppsGroupTable(groupName, groupData) {
  const apps = groupData?.applications || [];
  const simpleColumns = SIMPLE_GROUP_COLUMNS[groupName?.toUpperCase()];
  const columns = simpleColumns
    || (groupName?.toUpperCase() === 'PERFORMANCE ENGINE' ? PERFORMANCE_APP_COLUMNS : APP_COLUMNS);

  const table = document.createElement('table');
  table.className = simpleColumns ? 'pd-apps-table pd-apps-table-simple' : 'pd-apps-table';

  if (!simpleColumns) {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(({ label }) => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  apps.forEach((app) => {
    const tr = document.createElement('tr');
    columns.forEach(({ get, fallback = '' }) => {
      const td = document.createElement('td');
      td.textContent = get(app) || fallback;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}

function buildAppsTable(applicationGroupList) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pd-apps-wrapper';

  const groups = Object.entries(applicationGroupList || {})
    .filter(([, groupData]) => (groupData?.applications || []).length > 0)
    .sort(([a], [b]) => {
      const aPos = TAB_ORDER.indexOf(a.toUpperCase());
      const bPos = TAB_ORDER.indexOf(b.toUpperCase());
      return (aPos === -1 ? TAB_ORDER.length : aPos) - (bPos === -1 ? TAB_ORDER.length : bPos);
    });

  if (!groups.length) {
    const p = document.createElement('p');
    p.textContent = 'No application data available.';
    wrapper.appendChild(p);
    return wrapper;
  }

  if (groups.length === 1) {
    const [groupName, groupData] = groups[0];
    const groupTitle = document.createElement('h3');
    groupTitle.className = 'pd-apps-group-title';
    groupTitle.textContent = TAB_LABELS[groupName.toUpperCase()] || groupName;
    wrapper.append(groupTitle, buildAppsGroupTable(groupName, groupData));
    return wrapper;
  }

  const nav = document.createElement('div');
  nav.className = 'pd-apps-subtab-nav';

  const panels = document.createElement('div');
  panels.className = 'pd-apps-subtab-panels';

  groups.forEach(([groupName, groupData], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pd-apps-subtab-btn';
    btn.textContent = TAB_LABELS[groupName.toUpperCase()] || groupName;

    const panel = document.createElement('div');
    panel.className = 'pd-apps-subtab-panel';
    panel.appendChild(buildAppsGroupTable(groupName, groupData));

    if (i === 0) {
      btn.classList.add('pd-apps-subtab-btn-active');
    } else {
      panel.hidden = true;
    }

    btn.addEventListener('click', () => {
      nav.querySelectorAll('.pd-apps-subtab-btn').forEach((b) => b.classList.remove('pd-apps-subtab-btn-active'));
      panels.querySelectorAll('.pd-apps-subtab-panel').forEach((p) => { p.hidden = true; });
      btn.classList.add('pd-apps-subtab-btn-active');
      panel.hidden = false;
    });

    nav.appendChild(btn);
    panels.appendChild(panel);
  });

  wrapper.append(nav, panels);
  return wrapper;
}

function buildOtherMedia(documents) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pd-media-wrapper';
  if (!documents.length) return wrapper;

  const heading = document.createElement('h3');
  heading.className = 'pd-media-section-title';
  heading.textContent = 'Documents';
  wrapper.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'pd-media-list';
  documents.forEach((doc) => {
    const card = document.createElement('a');
    card.className = 'pd-media-card';
    card.href = doc.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const titleEl = document.createElement('span');
    titleEl.className = 'pd-media-card-title';
    titleEl.textContent = doc.title;
    const langEl = document.createElement('span');
    langEl.className = 'pd-media-card-lang';
    langEl.textContent = `Language: ${doc.language}`;
    card.append(titleEl, langEl);
    list.appendChild(card);
  });
  wrapper.appendChild(list);
  return wrapper;
}

// Below DESKTOP_QUERY, .pd-tabs is an accordion (drivparts.com mobile): each
// section toggles independently and all start collapsed. At/above it, it's a
// tab strip (drivparts.com desktop): one panel visible at a time, "Description"
// excluded (desktop shows description inline in the info column — see
// buildInfo — not as a tab; it's hidden there via CSS).
function buildTabs(descriptionPanel, specsPanel, appsPanel, mediaPanel) {
  const tabs = document.createElement('div');
  tabs.className = 'pd-tabs';

  const nav = document.createElement('div');
  nav.className = 'pd-tab-nav';

  const allPanels = [
    { id: 'description', label: 'Description', panel: descriptionPanel },
    { id: 'specs', label: 'Specifications', panel: specsPanel },
    { id: 'apps', label: 'Applications', panel: appsPanel },
    { id: 'media', label: 'Other Media', panel: mediaPanel },
  ].filter(({ id, panel }) => panel.children.length > 0 || id === 'specs' || id === 'apps');

  const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
  const defaultId = allPanels.find(({ id }) => id !== 'description')?.id;

  allPanels.forEach(({ id, label, panel }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pd-tab-btn';
    btn.dataset.tab = id;
    btn.textContent = label;
    panel.classList.add('pd-tab-panel');
    panel.dataset.tab = id;

    const isDefaultActive = isDesktop && id === defaultId;
    panel.hidden = !isDefaultActive;
    btn.setAttribute('aria-expanded', String(isDefaultActive));
    if (isDefaultActive) btn.classList.add('pd-tab-btn-active');

    btn.addEventListener('click', () => {
      if (window.matchMedia(DESKTOP_QUERY).matches) {
        nav.querySelectorAll('.pd-tab-btn').forEach((b) => {
          b.classList.remove('pd-tab-btn-active');
          b.setAttribute('aria-expanded', 'false');
        });
        tabs.querySelectorAll('.pd-tab-panel').forEach((p) => { p.hidden = true; });
        btn.classList.add('pd-tab-btn-active');
        btn.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
      } else {
        const nowOpen = panel.hidden;
        panel.hidden = !nowOpen;
        btn.setAttribute('aria-expanded', String(nowOpen));
      }
    });

    nav.appendChild(btn);
  });

  tabs.append(nav, ...allPanels.map((p) => p.panel));
  return tabs;
}

// ── Eager module-level fetches ────────────────────────────────────────────
// Placed here — after all function definitions — to satisfy no-use-before-define
// while still starting network requests as early as possible (before the
// browser calls decorate(), reducing LCP resource-load delay).
(function startEagerFetches() {
  const sp = new URLSearchParams(window.location.search);
  const earlyPartNumber = sp.get('part_number');
  const earlyBrandCode = sp.get('brand_code');
  if (earlyPartNumber && earlyBrandCode) {
    partDetailsPromise = fetchPartDetails(earlyPartNumber, earlyBrandCode);
  }
  fetchBrandLogoMap();
}());

export default async function decorate(block) {
  // Preconnects and brand-logo fetch are already started at module-load time.
  // Call injectPreconnects() again here in case head wasn't ready at module load.
  injectPreconnects();

  const sp = new URLSearchParams(window.location.search);
  const partNumber = sp.get('part_number');
  const brandCode = sp.get('brand_code');
  const partName = sp.get('part_name') || '';

  const layout = document.createElement('div');
  layout.className = 'pd-layout';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'pd-loading';
  loadingEl.setAttribute('aria-live', 'polite');
  const spinner = document.createElement('span');
  spinner.className = 'pd-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const loadingText = document.createElement('span');
  loadingText.textContent = 'Loading part details…';
  loadingEl.append(spinner, loadingText);

  const errorEl = document.createElement('div');
  errorEl.className = 'pd-error';
  errorEl.hidden = true;
  const errorMsg = document.createElement('p');
  errorMsg.className = 'pd-error-message';
  const retryBtn = document.createElement('button');
  retryBtn.className = 'pd-retry-btn';
  retryBtn.textContent = 'Try Again';
  errorEl.append(errorMsg, retryBtn);

  const backBtn = document.createElement('a');
  backBtn.className = 'pd-back-btn';
  backBtn.href = sitePath('/results');
  backBtn.textContent = 'Back To Product List';
  backBtn.addEventListener('click', (e) => {
    if (window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  });

  block.innerHTML = '';
  block.append(backBtn, loadingEl, errorEl, layout);

  if (!partNumber || !brandCode) {
    loadingEl.hidden = true;
    errorMsg.textContent = `Missing part number or brand code${partName ? ` for "${partName}"` : ''}.`;
    errorEl.hidden = false;
    return;
  }

  async function load() {
    loadingEl.hidden = false;
    errorEl.hidden = true;
    layout.innerHTML = '';

    try {
      // Reuse the eager module-level fetch if it's already in flight;
      // fall back to a fresh fetch on retry (partDetailsPromise may be null).
      const apiPromise = partDetailsPromise || fetchPartDetails(partNumber, brandCode);
      partDetailsPromise = apiPromise; // keep cached for retry

      const [[product, appsData], brandLogoMap] = await Promise.all([
        apiPromise,
        fetchBrandLogoMap(),
      ]);

      // Inject <link rel="preload"> for the LCP image the moment the URL is
      // known — before any DOM is built — so the browser can start the download
      // as early as possible.
      const firstPrimary = product.dam_assets?.productPrimaries?.[0];
      preloadLCPImage(resolveImageUrl(firstPrimary?.url));

      loadingEl.hidden = true;

      const primaries = product.dam_assets?.productPrimaries || [];
      const thumbnails = product.dam_assets?.productThumbnails || [];
      const documents = product.dam_assets?.productDocuments || [];
      const gallery = buildGallery(primaries, thumbnails);
      const info = buildInfo(product, brandLogoMap, brandCode);
      const descriptionPanel = buildDescriptionPanel(product);
      const specsPanel = buildSpecsTable(product.part_attributes, product.part_type);
      const appsPanel = buildAppsTable(appsData.application_group_list);
      const mediaPanel = buildOtherMedia(documents);
      const tabs = buildTabs(descriptionPanel, specsPanel, appsPanel, mediaPanel);

      layout.append(gallery, info, tabs);
    } catch {
      loadingEl.hidden = true;
      errorMsg.textContent = 'Failed to load part details. Please try again.';
      errorEl.hidden = false;
    }
  }

  retryBtn.addEventListener('click', load);
  load();
}
