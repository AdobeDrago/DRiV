/**
 * Hybris storefront session helpers (same-origin via CF or local proxy).
 */

export const STOREFRONT = {
  // Do NOT use clear=true here — header session probes and the homepage iframe
  // hit this URL often; clear=true can reset the Hybris session/cart and leave
  // Shopping Cart empty after a successful add.
  iframe: '/fmstorefront/federalmogul/en/USD/iframe?site=federalmogul',
  logout: '/fmstorefront/federalmogul/en/USD/logout',
  account: '/fmstorefront/federalmogul/en/USD/my-fmaccount/profile',
  signIn: '/fmstorefront/federalmogul/en/USD/sign-in',
  cart: '/fmstorefront/federalmogul/en/USD/cart',
  miniCart: '/fmstorefront/federalmogul/en/USD/cart/miniCart/rollover',
  addToCart: '/fmstorefront/federalmogul/en/USD/fme-cat-cart/entries/add',
  carts: '/fmwebservice/v2/federalmogul/users/current/carts',
  endEmulate: '/fmstorefront/federalmogul/en/USD/csr-emulation/end-emulate',
};

/**
 * Field map for Hybris catalog add-to-cart form (QA driv-part-list-modal).
 * product.code = (hybris_brand_code || '') + part_number — often just part_number
 * when the catalog API omits hybris_brand_code (QA filterPartDetailObj).
 * Native QA does not send CSRFToken — see clientlib-all driv-part-list-modal.
 */
const ADD_TO_CART_FIELDS = [
  { name: (i) => `entryList[${i}].entryNumber`, value: (_part, i) => String(i) },
  {
    name: (i) => `entryList[${i}].product.code`,
    value: (part) => `${part.brandCode || ''}${part.partNumber || ''}`,
  },
  { name: (i) => `entryList[${i}].quantity`, value: (part) => String(part.qty || 1) },
  {
    name: (i) => `entryList[${i}].product.manufacturer`,
    value: (part) => part.brandCode || '',
  },
  {
    name: (i) => `entryList[${i}].product.url`,
    value: (part) => part.imageUrl || '',
  },
];

/**
 * QA catalog-api stores relative /bin/fmmp or /content/dam paths only.
 * External URLs (S3, www.drivparts.com) are omitted from the cart POST.
 * @param {string} url
 * @returns {string}
 */
export function normalizeCartImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('/')) return url;
  return '';
}

/**
 * @param {Record<string, unknown>} part
 * @returns {{ brandCode: string, partNumber: string, qty: number, imageUrl: string } | null}
 */
function normalizeCartPart(part) {
  const partNumber = String(part.part_number || part.partNumber || '').trim();
  if (!partNumber) return null;
  const brandCode = String(part.brand_code || part.brandCode || '').trim();
  const qty = Number(part.quantity ?? part.qty ?? 1);
  const imageUrl = normalizeCartImageUrl(String(part.imageUrl || ''));
  return {
    brandCode,
    partNumber,
    qty: Number.isFinite(qty) && qty >= 1 ? qty : 1,
    imageUrl,
  };
}

/**
 * @typedef {{ ok: true } | { ok: false, reason: string }} AddToCartResult
 */

/**
 * Posts the parts list to Hybris via a full-page form submit (same as QA).
 * Guests are 302'd to sign-in; authenticated/emulating sessions continue to cart.
 * @param {Array<Record<string, unknown>>} items
 * @returns {AddToCartResult}
 */
export function submitPartsListToCart(items) {
  const validItems = (items || [])
    .map((part) => normalizeCartPart(part))
    .filter(Boolean);
  if (!validItems.length) {
    return { ok: false, reason: 'Your parts list is empty.' };
  }

  const form = document.createElement('form');
  form.method = 'post';
  form.action = STOREFRONT.addToCart;
  form.setAttribute('modelAttribute', 'cartForm');
  form.hidden = true;

  validItems.forEach((part, i) => {
    ADD_TO_CART_FIELDS.forEach((field) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = field.name(i);
      input.value = field.value(part, i);
      form.append(input);
    });
  });

  document.body.append(form);
  try {
    sessionStorage.removeItem('fm-login-return');
  } catch {
    // ignore quota / private mode
  }
  form.submit();
  return { ok: true };
}

/**
 * Reads the Hybris OAuth cookie set after storefront login (Angular $cookies object).
 * Angular encodes objects as `j:{...}` via putObject.
 * @returns {{ token_type?: string, access_token?: string } | null}
 */
function getHybrisAuthToken() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)HybrisAuthToken=([^;]*)/);
    if (!match) return null;
    let raw = decodeURIComponent(match[1]);
    if (raw.startsWith('j:')) raw = raw.slice(2);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * QA mini-cart JSON: {"miniCartCount": 0, "miniCartPrice": ""}.
 * @returns {Promise<number>}
 */
async function fetchCartCount() {
  try {
    const resp = await fetch(STOREFRONT.miniCart, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!resp.ok) return 0;
    const text = (await resp.text()).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return 0;
    const data = JSON.parse(jsonMatch[0]);
    const count = Number(data.miniCartCount);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * @typedef {{
 *   name: string,
 *   code: string,
 *   quantity: number,
 *   imageUrl: string,
 *   price: number | null,
 * }} MiniCartEntry
 * @typedef {{
 *   totalItems: number,
 *   totalPrice: number | null,
 *   entries: MiniCartEntry[],
 * }} MiniCartDetails
 */

/**
 * Best-effort mini-cart payload for the header hover popup.
 * Prefers OCC carts when an OAuth cookie is present; otherwise count-only.
 * @returns {Promise<MiniCartDetails>}
 */
export async function fetchMiniCartDetails() {
  const empty = { totalItems: 0, totalPrice: null, entries: [] };
  const auth = getHybrisAuthToken();
  const authHeader = auth?.token_type && auth?.access_token
    ? `${auth.token_type} ${auth.access_token}`
    : '';

  if (authHeader) {
    try {
      const resp = await fetch(STOREFRONT.carts, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        const cart = data?.carts?.[0];
        if (cart) {
          const entries = (cart.entries || []).map((entry) => {
            const images = entry.product?.images || [];
            const thumb = images.find((img) => img.format === 'thumbnail') || images[0];
            return {
              name: entry.product?.name || '',
              code: entry.product?.code || '',
              quantity: Number(entry.quantity) || 0,
              imageUrl: thumb?.url || '/content/dam/placeholders/missing-product-96x96.jpg',
              price: Number.isFinite(Number(entry.basePrice?.value))
                ? Number(entry.basePrice.value)
                : null,
            };
          });
          return {
            totalItems: Number(cart.totalItems) || entries.length,
            totalPrice: Number.isFinite(Number(cart.totalPriceWithTax?.value))
              ? Number(cart.totalPriceWithTax.value)
              : null,
            entries,
          };
        }
      }
    } catch {
      // fall through to count-only
    }
  }

  const count = await fetchCartCount();
  return { ...empty, totalItems: count };
}

/**
 * @typedef {'anonymous' | 'csr' | 'emulating'} StorefrontMode
 * @typedef {{
 *   loggedIn: boolean,
 *   mode: StorefrontMode,
 *   displayName: string,
 *   emulateLabel: string,
 *   cartCount: number,
 * }} StorefrontSession
 */

const ANONYMOUS_SESSION = {
  loggedIn: false, mode: 'anonymous', displayName: '', emulateLabel: '', cartCount: 0,
};

/**
 * @param {string} html
 * @returns {StorefrontMode}
 */
export function getStorefrontModeFromHtml(html) {
  if (!html) return 'anonymous';
  if (/page-fmAnonymousHomePage/i.test(html)) return 'anonymous';
  if (/page-CSRHomePage|page-fmCSRHomePage/i.test(html)
    || (/Emulate Account/i.test(html) && !/ACCOUNT DETAILS/i.test(html))) {
    return 'csr';
  }
  if (/page-FMB2BHomePage|b2BLandingHomePage|pageLabel-b2BLanding/i.test(html)
    || (/ACCOUNT DETAILS/i.test(html) && /QUICK ORDER/i.test(html))) {
    return 'emulating';
  }
  return 'anonymous';
}

/**
 * @param {Document | null | undefined} doc
 * @returns {StorefrontMode}
 */
export function getStorefrontDocMode(doc) {
  if (!doc?.body) return 'anonymous';
  return getStorefrontModeFromHtml(`${doc.body.className}\n${doc.body.innerText?.slice(0, 800) || ''}`);
}

/**
 * @param {Document | null | undefined} doc
 * @returns {boolean}
 */
export function isAuthenticatedStorefrontDoc(doc) {
  return getStorefrontDocMode(doc) === 'csr';
}

/**
 * @param {Document | null | undefined} doc
 * @returns {boolean}
 */
export function isEmulatingStorefrontDoc(doc) {
  return getStorefrontDocMode(doc) === 'emulating';
}

/**
 * Best-effort parse of "0020022111 - SOUTHERN AUTO SUPPLY" from B2B markup.
 * Prefer Ship To (emulated customer) over Sold To.
 * @param {string} html
 * @returns {string}
 */
function parseEmulateLabel(html) {
  const plain = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ');

  const blockMatch = plain.match(/Ship To\s*([\s\S]{0,350}?\d{7,12}\s*\/\s*[A-Z0-9]+)/i)
    || plain.match(/Sold To\s*([\s\S]{0,350}?\d{7,12}\s*\/\s*[A-Z0-9]+)/i);
  if (!blockMatch) return '';

  const block = blockMatch[1];
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const numLine = lines.find((l) => /^\d{7,12}\s*\//.test(l));
  const nameLine = lines.find((l) => /^[A-Z0-9][A-Z0-9 /&.'-]{2,60}$/.test(l)
    && !/^\d{7,12}/.test(l)
    && !/\d{5}/.test(l) // skip address/zip lines
    && !/^(US|USA)$/i.test(l));
  if (numLine && nameLine) {
    const num = numLine.match(/^(\d{7,12})/)[1];
    return `${num} - ${nameLine}`;
  }
  return '';
}

/**
 * Probe the storefront iframe HTML for auth / CSR / emulation state.
 * @returns {Promise<StorefrontSession>}
 */
export async function getStorefrontSession() {
  try {
    const resp = await fetch(STOREFRONT.iframe, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!resp.ok) return { ...ANONYMOUS_SESSION };
    const html = await resp.text();
    const mode = getStorefrontModeFromHtml(html);
    const loggedIn = mode === 'csr' || mode === 'emulating';
    let displayName = '';
    let emulateLabel = mode === 'emulating' ? parseEmulateLabel(html) : '';
    let cartCount = 0;

    const welcome = html.match(/Welcome\s+([A-Za-z][A-Za-z0-9 .'-]{1,60})/);
    if (welcome) {
      displayName = welcome[1].trim();
    } else if (loggedIn) {
      const profile = await fetch(STOREFRONT.account, {
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => null);
      if (profile?.ok) {
        const profileHtml = await profile.text();
        const fromProfile = profileHtml.match(/Welcome\s+([A-Za-z][A-Za-z0-9 .'-]{1,60})/)
          || profileHtml.match(/class="[^"]*user-name[^"]*"[^>]*>\s*([^<]{2,60})/i);
        if (fromProfile) displayName = fromProfile[1].trim();
        if (!emulateLabel && mode === 'emulating') {
          emulateLabel = parseEmulateLabel(profileHtml);
        }
      }
    }

    if (loggedIn) {
      cartCount = await fetchCartCount();
    }

    return {
      loggedIn, mode, displayName, emulateLabel, cartCount,
    };
  } catch (e) {
    return { ...ANONYMOUS_SESSION };
  }
}
