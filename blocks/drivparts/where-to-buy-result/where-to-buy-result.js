import { fetchPlaceholders } from '../../../scripts/placeholders.js';
import { CATALOG_API_BASE } from '../../../scripts/catalog.js';

const WHERE_TO_BUY_API = `${CATALOG_API_BASE}/wheretobuy`;
const DEFAULT_DISTANCE = 10;
const DEFAULT_MAP_CENTER = { lat: 39.5, lng: -98.35 };
const DEFAULT_MAP_ZOOM = 4;

const WTB_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#866866' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e1e1e1' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e1e1e1' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e1e1e1' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e1e1e1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#90daee' }] },
];

const GOOGLE_MAPS_API_KEY = 'AIzaSyB7CwSxOBupXIvJUL1ddkcZ1sxwORUxXF0';

const DISTANCES = [5, 10, 25, 50, 100];

/** English fallbacks when placeholders.json is missing or a key is absent. */
const FALLBACK_LABELS = {
  wtbCountryLabel: 'Country',
  wtbPostalLabel: 'ZIP/Postal Code',
  wtbPostalPlaceholder: 'Enter a ZIP/Postal Code',
  wtbBrandLabel: 'Brand',
  wtbAllBrands: '-- All Brands --',
  wtbSearch: 'Search',
  wtbFilterBy: 'Filter By',
  wtbLocationLegend: 'Location',
  wtbDistanceLegend: 'Distance',
  wtbDistanceUnit: 'mi.',
  wtbLocationStore: 'Parts Store',
  wtbLocationInstall: 'Repair Shop',
  wtbLocationAll: 'Parts Store and Repair Shop',
  wtbPrompt: 'Enter a Postal Code or City to Search Nearby',
  wtbLoading: 'Finding locations…',
  wtbLoadError: 'Failed to load locations. Please try again.',
  wtbRetry: 'Try Again',
  wtbEmpty: 'No locations found near this ZIP/Postal Code. Try a different code, a larger distance, or clearing the brand filter.',
  wtbFilterToggle: 'Filter',
  wtbZoomIn: 'Zoom in',
  wtbZoomOut: 'Zoom out',
  wtbDirections: 'Directions',
  wtbWebsite: 'Visit Website',
  wtbMilesAway: '{distance} Miles Away',
  wtbResultsHeadline: '{count} Location{plural} Found Near {postal}',
};

const COUNTRIES = {
  DZ: { name: 'Algeria', brands: [] },
  AT: { name: 'Austria', brands: ['Ferodo', 'Jurid', 'MOOG', 'Walker'] },
  BY: { name: 'Belarus', brands: [] },
  BE: { name: 'Belgium', brands: ['AE', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Payen'] },
  BA: {
    name: 'Bosnia And Herzegovina',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  BW: { name: 'Botswana', brands: [] },
  BG: {
    name: 'Bulgaria',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  CA: {
    name: 'Canada',
    brands: ['Champion', 'FP Diesel', 'Fel-Pro', 'Ferodo', 'MOOG', 'Payen', 'Sealed Power', 'Speed Pro', 'Wagner', 'Walker'],
  },
  HR: {
    name: 'Croatia',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  CY: { name: 'Cyprus', brands: [] },
  CZ: {
    name: 'Czech Republic',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  EG: { name: 'Egypt', brands: [] },
  ER: { name: 'Eritrea', brands: [] },
  EE: {
    name: 'Estonia',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  ET: { name: 'Ethiopia', brands: [] },
  FR: { name: 'France', brands: ['Champion', 'Ferodo', 'MOOG', 'Payen'] },
  DE: {
    name: 'Germany',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Payen', 'Walker'],
  },
  GR: {
    name: 'Greece',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  HU: {
    name: 'Hungary',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  IE: { name: 'Ireland', brands: ['Champion', 'Ferodo', 'Jurid', 'MOOG'] },
  IT: {
    name: 'Italy',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'Duron', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'Necto', 'Payen', 'Wagner'],
  },
  KZ: { name: 'Kazakhstan', brands: ['AE', 'Ferodo', 'Glyco', 'Goetze', 'MOOG', 'Payen'] },
  KE: { name: 'Kenya', brands: ['Ferodo'] },
  KW: { name: 'Kuwait', brands: [] },
  LV: {
    name: 'Latvia',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  LB: { name: 'Lebanon', brands: [] },
  LI: { name: 'Liechtenstein', brands: ['Ferodo', 'Payen', 'Walker'] },
  LT: {
    name: 'Lithuania',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  LU: { name: 'Luxembourg', brands: ['Beru', 'Champion', 'Ferodo'] },
  MT: { name: 'Malta', brands: [] },
  MX: { name: 'Mexico', brands: [] },
  MD: {
    name: 'Moldova',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  NA: { name: 'Namibia', brands: [] },
  NL: {
    name: 'Netherlands',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'Duron', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner'],
  },
  PL: { name: 'Poland', brands: ['AE', 'Beral', 'Beru', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Payen'] },
  PT: {
    name: 'Portugal',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner'],
  },
  RO: {
    name: 'Romania',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  RU: { name: 'Russia', brands: ['AE', 'Beral', 'Beru', 'Champion', 'Ferodo', 'Glyco', 'Goetze', 'MOOG', 'Payen'] },
  SA: { name: 'Saudi Arabia', brands: [] },
  RS: { name: 'Serbia', brands: [] },
  SK: {
    name: 'Slovakia',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  SI: {
    name: 'Slovenia',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Wagner', 'Walker'],
  },
  SO: { name: 'Somalia', brands: [] },
  ZA: { name: 'South Africa', brands: ['AE', 'Beru', 'Champion', 'Ferodo', 'Goetze', 'Payen'] },
  ES: { name: 'Spain', brands: ['AE', 'Beru', 'Champion', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Necto', 'Payen', 'Walker'] },
  SZ: { name: 'Swaziland', brands: [] },
  CH: { name: 'Switzerland', brands: ['Ferodo', 'Payen', 'Walker'] },
  TR: {
    name: 'Turkey',
    brands: ['AE', 'Beral', 'Beru', 'Champion', 'Duron', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'Necto', 'Payen', 'Wagner'],
  },
  UA: { name: 'Ukraine', brands: ['AE', 'Beral', 'Beru', 'Champion', 'FP Diesel', 'Ferodo', 'Glyco', 'Goetze', 'MOOG', 'Payen'] },
  AE: { name: 'United Arab Emirates', brands: [] },
  GB: { name: 'United Kingdom', brands: ['AE', 'Beru', 'Champion', 'Ferodo', 'Glyco', 'Goetze', 'Jurid', 'MOOG', 'Payen', 'Walker'] },
  US: {
    name: 'United States',
    brands: ['Champion', 'FP Diesel', 'Fel-Pro', 'Ferodo', 'Jurid', 'MOOG', 'Payen', 'Sealed Power', 'Speed Pro', 'Wagner', 'Walker'],
  },
  ZM: { name: 'Zambia', brands: [] },
  ZW: { name: 'Zimbabwe', brands: [] },
};

const DEFAULT_COUNTRY = 'US';

const COUNTRIES_BY_NAME = Object.entries(COUNTRIES)
  .sort((a, b) => a[1].name.localeCompare(b[1].name));

let googleMapsApiPromise = null;
let googleMapsPreconnected = false;

/** Active labels for this decorate pass (placeholders merged over fallbacks). */
let labels = { ...FALLBACK_LABELS };

// Warms up the connection to Google's Maps hosts ahead of the actual script/tile requests,
// so the DNS/TLS handshake overlaps with the user filling out the search form instead of
// blocking the map after a search. Safe to call repeatedly; only adds the hints once.
function preconnectGoogleMaps() {
  if (googleMapsPreconnected) return;
  googleMapsPreconnected = true;
  ['https://maps.googleapis.com', 'https://maps.gstatic.com'].forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    document.head.append(link);
  });
}

// Loads the Google Maps JS API script once and caches the loading promise for subsequent calls.
function loadGoogleMapsApi() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsApiPromise) return googleMapsApiPromise;
  preconnectGoogleMaps();
  googleMapsApiPromise = new Promise((resolve, reject) => {
    const callbackName = '__wtbGoogleMapsLoaded';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.append(script);
  });
  return googleMapsApiPromise;
}

/**
 * Resolves a placeholder key to display text, optionally substituting `{name}` tokens.
 * @param {keyof typeof FALLBACK_LABELS} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
function t(key, vars) {
  let str = labels[key] || FALLBACK_LABELS[key] || '';
  if (vars) {
    Object.entries(vars).forEach(([name, value]) => {
      str = str.replaceAll(`{${name}}`, value);
    });
  }
  return str;
}

/** Location-type filter options; labels resolved from placeholders. */
function locationTypes() {
  return [
    { value: 'store', label: t('wtbLocationStore') },
    { value: 'install', label: t('wtbLocationInstall') },
    { value: 'all', label: t('wtbLocationAll') },
  ];
}

// Extracts the authored text value from a block row, preferring the second cell if present.
function authoredValue(row) {
  if (!row) return '';
  const cells = [...row.children];
  const valueCell = cells.length > 1 ? cells[1] : cells[0];
  return valueCell?.textContent.trim() || '';
}

// Fetches JSON from a URL, returning an { ok, data } result instead of throwing on failure.
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

// Builds the dealer search API URL from the current filter params.
function buildSearchUrl(params) {
  const usp = new URLSearchParams({
    postal: params.postal,
    country: params.country,
    locType: params.locType,
    distance: String(params.distance),
  });
  if (params.brand) usp.set('brand', params.brand);
  return `${WHERE_TO_BUY_API}?${usp}`;
}

// Builds a Google Maps directions URL for the given dealer's address.
function directionsUrl(dealer) {
  return `https://maps.google.com/?q=${encodeURIComponent(dealer.address?.address || '')}`;
}

// Creates a results list row with dealer name, address, contact links, and directions button.
function buildDealerRow(dealer, onSelect) {
  const li = document.createElement('li');
  li.className = 'where-to-buy-result-row';

  const name = document.createElement('p');
  name.className = 'where-to-buy-result-row-name';
  name.textContent = dealer.name;
  name.addEventListener('click', onSelect);

  const addressLine = document.createElement('div');
  addressLine.className = 'where-to-buy-result-row-address-line';
  const address = document.createElement('span');
  address.className = 'where-to-buy-result-row-address';
  address.textContent = dealer.address?.address || '';
  const distance = document.createElement('strong');
  distance.className = 'where-to-buy-result-row-distance';
  distance.textContent = t('wtbMilesAway', { distance: dealer.distance });
  addressLine.append(address, distance);

  const links = document.createElement('div');
  links.className = 'where-to-buy-result-row-links';
  if (dealer.officePhone) {
    const phone = document.createElement('a');
    phone.className = 'where-to-buy-result-row-phone';
    phone.href = `tel:${dealer.officePhone.replace(/\D/g, '')}`;
    phone.textContent = dealer.officePhone;
    links.append(phone);
  }
  if (dealer.preferredVendorURL) {
    const website = document.createElement('a');
    website.className = 'where-to-buy-result-row-website';
    website.href = dealer.preferredVendorURL;
    website.target = '_blank';
    website.rel = 'noopener';
    website.textContent = t('wtbWebsite');
    links.append(website);
  }

  const content = document.createElement('div');
  content.className = 'where-to-buy-result-row-content';
  content.append(name, addressLine, links);

  const actions = document.createElement('div');
  actions.className = 'where-to-buy-result-row-actions';
  const directions = document.createElement('a');
  directions.className = 'where-to-buy-result-row-directions';
  directions.href = directionsUrl(dealer);
  directions.target = '_blank';
  directions.rel = 'noopener';
  directions.textContent = t('wtbDirections');
  actions.append(directions);

  li.append(content, actions);
  return li;
}

// Builds the DOM content shown inside a map marker's info window for a dealer.
function buildInfoWindowContent(dealer) {
  const wrapper = document.createElement('div');
  wrapper.className = 'where-to-buy-result-infowindow';
  const name = document.createElement('strong');
  name.textContent = dealer.name;
  const address = document.createElement('div');
  address.textContent = dealer.address?.address || '';
  const directions = document.createElement('a');
  directions.className = 'where-to-buy-result-infowindow-directions';
  directions.href = directionsUrl(dealer);
  directions.target = '_blank';
  directions.rel = 'noopener';
  directions.textContent = t('wtbDirections');
  wrapper.append(name, address, directions);
  return wrapper;
}

// Builds the custom zoom in/out control buttons for the map.
function buildZoomControl(map) {
  const wrapper = document.createElement('div');
  wrapper.className = 'where-to-buy-result-zoom-control';

  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.className = 'where-to-buy-result-zoom-btn where-to-buy-result-zoom-in';
  zoomIn.setAttribute('aria-label', t('wtbZoomIn'));
  zoomIn.textContent = '+';
  zoomIn.addEventListener('click', () => map.setZoom(map.getZoom() + 1));

  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.className = 'where-to-buy-result-zoom-btn where-to-buy-result-zoom-out';
  zoomOut.setAttribute('aria-label', t('wtbZoomOut'));
  zoomOut.textContent = '−';
  zoomOut.addEventListener('click', () => map.setZoom(map.getZoom() - 1));

  wrapper.append(zoomIn, zoomOut);
  return wrapper;
}

// Creates the Google Map instance and its info window inside the given container.
function initMap(container) {
  const map = new window.google.maps.Map(container, {
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    styles: WTB_MAP_STYLES,
    mapTypeControl: false,
    zoomControl: false,
    fullscreenControl: true,
    streetViewControl: false,
  });
  map.controls[window.google.maps.ControlPosition.LEFT_TOP].push(buildZoomControl(map));
  const infoWindow = new window.google.maps.InfoWindow();
  return { map, infoWindow };
}

// Builds a radio-button filter group (e.g. Location or Distance) with a heading and options.
function buildFilterGroup(legend, name, options, selectedValue) {
  const group = document.createElement('div');
  group.className = 'where-to-buy-result-filter-group';

  const heading = document.createElement('h5');
  heading.textContent = legend;
  group.append(heading);

  options.forEach((opt) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'where-to-buy-result-filter-option';
    const id = `wtb-${name}-${opt.value}`;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.id = id;
    input.value = String(opt.value);
    input.checked = String(opt.value) === String(selectedValue);

    const label = document.createElement('label');
    label.setAttribute('for', id);
    const box = document.createElement('span');
    label.append(box, opt.label);

    wrapper.append(input, label);
    group.append(wrapper);
  });

  return group;
}

// Decorates the block: renders the search form, map, filters, and results UI, and wires up events.
export default async function decorate(block) {
  // This page isn't under a locale folder, so read the site-root placeholders sheet directly
  // rather than deriving a (non-existent) path-scoped one via getPlaceholdersPrefix().
  labels = { ...FALLBACK_LABELS, ...(await fetchPlaceholders()) };

  const [headingRow, descriptionRow] = [...block.children];
  const heading = authoredValue(headingRow);
  const description = authoredValue(descriptionRow);

  block.innerHTML = `
    <form class="where-to-buy-result-searchbar">
      <div class="where-to-buy-result-field where-to-buy-result-field-country">
        <label for="wtb-country">${t('wtbCountryLabel')} <span class="where-to-buy-result-required">*</span></label>
        <select id="wtb-country">
          ${COUNTRIES_BY_NAME.map(([code, { name }]) => `<option value="${code}"${code === DEFAULT_COUNTRY ? ' selected' : ''}>${name}</option>`).join('')}
        </select>
      </div>
      <div class="where-to-buy-result-field where-to-buy-result-field-postal">
        <label for="wtb-postal">${t('wtbPostalLabel')} <span class="where-to-buy-result-required">*</span></label>
        <input id="wtb-postal" name="zip" type="search" autocomplete="postal-code" placeholder="${t('wtbPostalPlaceholder')}" required>
      </div>
      <div class="where-to-buy-result-field where-to-buy-result-field-brand">
        <label for="wtb-brand">${t('wtbBrandLabel')}</label>
        <select id="wtb-brand">
          <option value="">${t('wtbAllBrands')}</option>
        </select>
      </div>
      <button type="submit" class="where-to-buy-result-submit">${t('wtbSearch')}</button>
    </form>
    <div class="where-to-buy-result-map" hidden></div>
    <div class="where-to-buy-result-body">
      <aside class="where-to-buy-result-filters">
        <div class="where-to-buy-result-filters-header">
          <h5>${t('wtbFilterBy')}</h5>
        </div>
      </aside>
      <div class="where-to-buy-result-main">
        <div class="where-to-buy-result-prompt">
          <h2>${t('wtbPrompt')}</h2>
        </div>
        <div class="where-to-buy-result-loading" hidden aria-live="polite">
          <span class="where-to-buy-result-spinner" aria-hidden="true"></span>
          <span>${t('wtbLoading')}</span>
        </div>
        <div class="where-to-buy-result-error" hidden>
          <p class="where-to-buy-result-error-message"></p>
          <button type="button" class="button secondary where-to-buy-result-retry">${t('wtbRetry')}</button>
        </div>
        <div class="where-to-buy-result-empty" hidden>
          <p>${t('wtbEmpty')}</p>
        </div>
        <div class="where-to-buy-result-results" hidden>
          <div class="where-to-buy-result-results-header">
            <h2 class="where-to-buy-result-headline"></h2>
            <button type="button" class="where-to-buy-result-filter-toggle">${t('wtbFilterToggle')}</button>
          </div>
          <ul class="where-to-buy-result-list"></ul>
        </div>
      </div>
    </div>
  `;

  if (heading || description) {
    const intro = document.createElement('div');
    intro.className = 'where-to-buy-result-intro';
    if (heading) {
      const headingEl = document.createElement('h2');
      headingEl.className = 'where-to-buy-result-heading';
      headingEl.textContent = heading;
      intro.append(headingEl);
    }
    if (description) {
      const descriptionEl = document.createElement('p');
      descriptionEl.className = 'where-to-buy-result-description';
      descriptionEl.textContent = description;
      intro.append(descriptionEl);
    }
    block.prepend(intro);
  }

  const filters = block.querySelector('.where-to-buy-result-filters');
  filters.append(
    buildFilterGroup(t('wtbLocationLegend'), 'locType', locationTypes(), 'all'),
    buildFilterGroup(
      t('wtbDistanceLegend'),
      'distance',
      DISTANCES.map((d) => ({ value: d, label: `${d} ${t('wtbDistanceUnit')}` })),
      DEFAULT_DISTANCE,
    ),
  );

  const form = block.querySelector('.where-to-buy-result-searchbar');
  const countrySelect = block.querySelector('#wtb-country');
  const postalInput = block.querySelector('#wtb-postal');
  const brandSelect = block.querySelector('#wtb-brand');
  const locTypeInputs = [...block.querySelectorAll('input[name="locType"]')];
  const distanceInputs = [...block.querySelectorAll('input[name="distance"]')];
  const filterToggle = block.querySelector('.where-to-buy-result-filter-toggle');

  const mapEl = block.querySelector('.where-to-buy-result-map');
  const promptEl = block.querySelector('.where-to-buy-result-prompt');
  const loadingEl = block.querySelector('.where-to-buy-result-loading');
  const errorEl = block.querySelector('.where-to-buy-result-error');
  const errorMsg = block.querySelector('.where-to-buy-result-error-message');
  const retryBtn = block.querySelector('.where-to-buy-result-retry');
  const emptyEl = block.querySelector('.where-to-buy-result-empty');
  const resultsEl = block.querySelector('.where-to-buy-result-results');
  const headlineEl = block.querySelector('.where-to-buy-result-headline');
  const listEl = block.querySelector('.where-to-buy-result-list');

  // A search is likely imminent once the user engages with the postal field, so warm up
  // the Maps connection now rather than waiting for the search to actually complete.
  postalInput.addEventListener('focus', preconnectGoogleMaps, { once: true });

  // Rebuilds the Brand <select> options for the given country, restoring selectedBrand if valid.
  function populateBrandSelect(countryCode, selectedBrand) {
    const brands = COUNTRIES[countryCode]?.brands || [];
    const value = selectedBrand && brands.includes(selectedBrand) ? selectedBrand : '';
    brandSelect.innerHTML = `
      <option value="">${t('wtbAllBrands')}</option>
      ${brands.map((brand) => `<option value="${brand}">${brand}</option>`).join('')}
    `;
    brandSelect.value = value;
  }

  let map = null;
  let infoWindow = null;
  let markers = [];
  let rows = [];
  let currentDealers = [];

  // Drops the list highlight so every dealer reads as selectable again.
  function clearSelection() {
    rows.forEach((row) => row.classList.remove('is-active'));
    listEl.classList.remove('has-selection');
  }

  // Highlights the dealer at the given index in the list and opens its map marker info window.
  function selectDealer(index) {
    const marker = markers[index];
    const dealer = currentDealers[index];
    if (!marker || !dealer || !map) return;
    rows.forEach((row, i) => row.classList.toggle('is-active', i === index));
    listEl.classList.add('has-selection');
    map.panTo(marker.getPosition());
    infoWindow.setContent(buildInfoWindowContent(dealer));
    infoWindow.open(map, marker);
  }

  // Resolves a country to its map viewport via Geocoding.
  async function centerMapOnCountry(countryCode) {
    const countryName = COUNTRIES[countryCode]?.name;
    if (countryName) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const result = await new Promise((resolve) => {
          geocoder.geocode({ address: countryName }, (results, status) => {
            resolve(status === 'OK' && results?.[0] ? results[0] : null);
          });
        });
        if (result?.geometry?.viewport) {
          map.fitBounds(result.geometry.viewport);
          return;
        }
      } catch {
        // fall through to the generic default below
      }
    }
    map.setCenter(DEFAULT_MAP_CENTER);
    map.setZoom(DEFAULT_MAP_ZOOM);
  }

  // Initializes the map (if needed), plots a marker per dealer, and fits the map bounds to them.
  // Dealers with missing/invalid coordinates are skipped rather than breaking the whole map.
  async function plotDealers(dealers, fallbackCountry) {
    try {
      await loadGoogleMapsApi();
      if (!map) {
        ({ map, infoWindow } = initMap(mapEl));
        // Closing the info window means "no dealer selected" — the list must un-dim.
        infoWindow.addListener('closeclick', clearSelection);
      } else {
        window.google.maps.event.trigger(map, 'resize');
      }

      currentDealers = dealers;
      clearSelection();
      markers.forEach((marker) => marker.setMap(null));
      markers = dealers.map((dealer, index) => {
        const { latitude, longitude } = dealer.address?.coordinates || {};
        if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
        const position = { lat: latitude, lng: longitude };
        const marker = new window.google.maps.Marker({ position, map, title: dealer.name });
        marker.addListener('click', () => selectDealer(index));
        return marker;
      });

      const bounds = new window.google.maps.LatLngBounds();
      markers.filter(Boolean).forEach((marker) => bounds.extend(marker.getPosition()));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
      } else if (fallbackCountry) {
        await centerMapOnCountry(fallbackCountry);
      } else {
        map.setCenter(DEFAULT_MAP_CENTER);
        map.setZoom(DEFAULT_MAP_ZOOM);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('where-to-buy-result: failed to plot dealers on map', error);
      mapEl.hidden = true;
    }
  }

  // Reads the current search/filter form values into a single params object.
  function currentParams() {
    return {
      country: countrySelect.value,
      postal: postalInput.value.trim(),
      locType: locTypeInputs.find((input) => input.checked)?.value || 'all',
      brand: brandSelect.value,
      distance: distanceInputs.find((input) => input.checked)?.value || String(DEFAULT_DISTANCE),
    };
  }

  // Writes the full filter state to the URL hash without triggering navigation.
  function updateUrl(params) {
    const usp = new URLSearchParams();
    usp.set('dealerType', 'physical');
    usp.set('locType', params.locType);
    usp.set('distance', params.distance);
    usp.set('partType', 'any');
    usp.set('subBrand', params.brand || 'all');
    usp.set('country', params.country);
    if (params.postal) usp.set('postal', params.postal);
    const next = `${window.location.pathname}#${usp}`;
    window.history.replaceState(null, '', next);
  }

  // Writes a minimal postal/brand/locType URL hash, used for the initial normalized search.
  function updateUrlMinimal(params) {
    const parts = [`postal=${encodeURIComponent(params.postal)}`];
    parts.push(params.brand ? `brand=${encodeURIComponent(params.brand)}` : 'brand');
    parts.push(`locType=${encodeURIComponent(params.locType)}`);
    window.history.replaceState(null, '', `${window.location.pathname}#${parts.join('&')}`);
  }

  // Fetches dealer search results for the given params, normalizing the response shape.
  async function loadResults(params) {
    const result = await fetchJson(buildSearchUrl(params));
    if (!result.ok) return { ok: false };
    return { ok: true, data: result.data?.data || { dealers: [] } };
  }

  // Hides every state section (prompt, loading, error, empty, results, map) before showing one.
  function hideAllStates() {
    promptEl.hidden = true;
    loadingEl.hidden = true;
    errorEl.hidden = true;
    emptyEl.hidden = true;
    resultsEl.hidden = true;
    mapEl.hidden = true;
  }

  // Runs a dealer search: updates the URL, fetches results, and renders the resulting UI state.
  async function runSearch(urlMode = 'full') {
    const params = currentParams();
    if (!params.postal) return;

    if (urlMode === 'full') updateUrl(params);
    else if (urlMode === 'minimal') updateUrlMinimal(params);
    hideAllStates();
    loadingEl.hidden = false;
    // Reserve the map's space up front, before the fetch resolves, so a successful
    // search (the common case) doesn't shift the results below it into view later.
    mapEl.hidden = false;
    listEl.innerHTML = '';

    const page = await loadResults(params);
    loadingEl.hidden = true;

    if (!page.ok) {
      mapEl.hidden = true;
      errorMsg.textContent = t('wtbLoadError');
      errorEl.hidden = false;
      return;
    }

    const { dealers } = page.data;
    if (!dealers.length) {
      mapEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    rows = dealers.map((dealer, index) => {
      const row = buildDealerRow(dealer, () => selectDealer(index));
      listEl.append(row);
      return row;
    });
    headlineEl.textContent = t('wtbResultsHeadline', {
      count: dealers.length,
      plural: dealers.length !== 1 ? 's' : '',
      postal: params.postal,
    });
    resultsEl.hidden = false;
    plotDealers(dealers);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch();
  });

  [...locTypeInputs, ...distanceInputs].forEach((input) => {
    input.addEventListener('change', () => {
      updateUrl(currentParams());
      if (postalInput.value.trim()) runSearch();
    });
  });

  brandSelect.addEventListener('change', () => {
    updateUrl(currentParams());
    if (postalInput.value.trim()) runSearch();
  });

  countrySelect.addEventListener('change', () => {
    postalInput.value = '';
    populateBrandSelect(countrySelect.value);
    updateUrl(currentParams());
    hideAllStates();
    promptEl.hidden = false;
    mapEl.hidden = false;
    plotDealers([], countrySelect.value);
  });

  retryBtn.addEventListener('click', runSearch);

  filterToggle.addEventListener('click', () => {
    const isOpen = filters.classList.toggle('is-open');
    filterToggle.setAttribute('aria-expanded', String(isOpen));
  });

  const hp = new URLSearchParams(window.location.hash.slice(1));
  const sp = new URLSearchParams(window.location.search);
  const initialPostal = hp.get('postal') || sp.get('zip') || sp.get('postal') || '';
  if (initialPostal) preconnectGoogleMaps();
  const initialCountry = hp.get('country') || sp.get('country');
  const initialLocType = hp.get('locType') || sp.get('locType');
  const hashBrand = hp.get('subBrand') || hp.get('brand');
  const initialBrand = (hashBrand && hashBrand !== 'all' ? hashBrand : '') || sp.get('brand');
  const initialDistance = hp.get('distance') || sp.get('distance');

  postalInput.value = initialPostal;
  if (initialCountry && COUNTRIES[initialCountry]) {
    countrySelect.value = initialCountry;
  }
  populateBrandSelect(countrySelect.value, initialBrand);
  if (initialLocType) {
    const match = locTypeInputs.find((input) => input.value === initialLocType);
    if (match) match.checked = true;
  }
  if (initialDistance) {
    const match = distanceInputs.find((input) => input.value === initialDistance);
    if (match) match.checked = true;
  }

  // Defer: this block can be a page's first section, so decorate() runs in the
  // eager phase. Running a search or loading Google Maps here would compete
  // with LCP; deferring lets it happen once the critical path is clear.
  const deferIdle = (fn) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(fn);
    else window.setTimeout(fn, 0);
  };

  if (initialPostal) {
    const urlMode = hp.get('postal') ? 'none' : 'minimal';
    deferIdle(() => runSearch(urlMode));
  } else {
    deferIdle(() => {
      mapEl.hidden = false;
      plotDealers([], countrySelect.value);
    });
  }
}
