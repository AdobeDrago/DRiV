/*
 * Hybris storefront block
 * Embeds the Hybris storefront panel the same way the main site does via
 * .page-include-container — a real <iframe> loading:
 *   /fmstorefront/federalmogul/en/USD/iframe?site=federalmogul
 *
 * Anonymous: Get More + Sign In (left Hybris "parts finder" slot is clipped;
 *   native Parts Finder sits beside the frame).
 * CSR: Emulate Account replaces Parts Finder + Get More + Sign In (full-width).
 * Emulating: choosing an account replaces Emulate Account with B2B Account
 *   Details / Quick Order; Parts Finder returns beside the frame (QA behavior).
 *
 * Src must be same-origin (production CF or local npm run proxy).
 */

import {
  STOREFRONT,
  getStorefrontDocMode,
} from '../../../scripts/storefront-session.js';

const frameResizeObservers = new WeakMap();

/** Section children that make up the hero row, still outside the layout. */
const HERO_WRAPPER_SELECTOR = ':scope > .parts-finder-wrapper, '
  + ':scope > .columns-promo-wrapper, '
  + ':scope > .sign-in-wrapper, '
  + ':scope > .hybris-storefront-wrapper';

/**
 * Always resolve to a same-origin path so CSP frame-ancestors 'self' passes.
 * @param {string} href
 * @returns {string}
 */
function toSameOriginSrc(href) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.pathname.includes('/fmstorefront')) {
      // clear=true can reset the Hybris session/cart; authored links sometimes
      // include it, but header probes and cart flows must not.
      url.searchParams.delete('clear');
      const search = url.searchParams.toString();
      return `${url.pathname}${search ? `?${search}` : ''}`;
    }
  } catch (e) {
    // fall through
  }
  return STOREFRONT.iframe;
}

/**
 * @param {string} src
 * @returns {Promise<boolean>}
 */
async function isStorefrontReachable(src) {
  try {
    const resp = await fetch(src, { method: 'GET', credentials: 'same-origin' });
    if (!resp.ok) return false;
    if (resp.redirected && resp.url.includes('/404')) return false;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return true;
    const text = await resp.text();
    if (/404 page not found|page not found/i.test(text)
      && !/fmAnonymousHomePage|CSRHomePage|loginform|Get More from|Emulate Account|FMB2BHomePage|ACCOUNT DETAILS/i.test(text)) {
      return false;
    }
    return /loginform|fmstorefront|Get More from|SIGN IN|Sign In|Emulate Account|CSRHomePage|FMB2BHomePage|ACCOUNT DETAILS/i.test(text)
      || text.length > 500;
  } catch (e) {
    return false;
  }
}

/**
 * @param {Element} block
 * @param {string} src
 */
function showProxyHint(block, src) {
  const hint = document.createElement('div');
  hint.className = 'hybris-storefront-unavailable';
  hint.innerHTML = `
    <p><strong>Storefront iframe blocked / not routed</strong></p>
    <p>Hybris only allows framing from the same origin
      (<code>frame-ancestors 'self'</code>). Opening
      <code>https://qa.drivparts.com/...</code> from this host is refused.</p>
    <p>To preview locally:</p>
    <ol>
      <li>Stop <code>aem up</code>, then run it on port 3001:<br>
        <code>aem up --port 3001 --no-open</code></li>
      <li>In another terminal: <code>npm run proxy</code></li>
      <li>Open <code>http://localhost:3000${src.split('?')[0]}</code> via the proxy host.</li>
    </ol>
    <p><a href="https://qa.drivparts.com${src}" target="_blank" rel="noopener">Open storefront on QA ↗</a></p>
  `;
  block.replaceChildren(hint);
}

/**
 * Publish the anonymous / CSR (Emulate Account) / emulating (B2B) mode as
 * data-storefront-mode on both the block and its section, which is what the
 * hero layout in drivparts.css keys off.
 * Dispatches storefront:auth so the header can refresh Welcome / End Emulate.
 * @param {Element} block
 * @param {HTMLIFrameElement} frame
 */
function syncAuthLayout(block, frame) {
  let mode = 'anonymous';
  try {
    mode = getStorefrontDocMode(frame.contentDocument);
  } catch (e) {
    mode = 'anonymous';
  }
  const prev = block.dataset.storefrontMode || 'anonymous';
  block.dataset.storefrontMode = mode;

  const section = block.closest('.section');
  if (section) section.dataset.storefrontMode = mode;

  if (mode !== prev) {
    window.dispatchEvent(new CustomEvent('storefront:auth', {
      detail: { loggedIn: mode === 'csr' || mode === 'emulating', mode },
    }));
  }
}

/**
 * Keep login POST and account-emulation links inside the iframe so the EDS
 * page is not replaced by /fmstorefront/... as a top-level document.
 * @param {HTMLIFrameElement} frame
 */
function bindLoginReturn(frame) {
  let doc;
  try {
    doc = frame.contentDocument;
  } catch (e) {
    return;
  }
  if (!doc) return;

  const form = doc.querySelector('#loginform');
  if (form && form.dataset.returnBound !== 'true') {
    form.dataset.returnBound = 'true';
    form.setAttribute('target', '_self');
    form.addEventListener('submit', () => {
      try {
        sessionStorage.setItem('fm-login-return', window.location.href);
      } catch (e) {
        // ignore quota / private mode
      }
    });
  }

  // Account # links must stay in-frame; Hybris may otherwise break out to parent
  doc.querySelectorAll('a[href*="start-emulate"], a[href*="end-emulate"]').forEach((a) => {
    if (a.dataset.hybrisBound === 'true') return;
    a.dataset.hybrisBound = 'true';
    a.setAttribute('target', '_self');
    a.addEventListener('click', () => {
      try {
        sessionStorage.setItem('fm-login-return', window.location.href);
      } catch (e) {
        // ignore
      }
    });
  });
}

/**
 * @param {Document} doc
 * @returns {number} Content height of the framed document
 */
function measureDocumentHeight(doc) {
  const { body, documentElement } = doc;
  return Math.ceil(Math.max(
    body?.scrollHeight || 0,
    documentElement.scrollHeight,
  ));
}

/**
 * Size the same-origin iframe to its document and follow later content changes.
 *
 * The frame is collapsed before every measurement: an iframe with an explicit
 * height gives its document that viewport height, so `scrollHeight` can only
 * ever grow and the panel would stay at its tallest (mobile) size on resize.
 * @param {Element} block
 * @param {HTMLIFrameElement} frame
 */
function bindFrameHeight(block, frame) {
  const previous = frameResizeObservers.get(frame);
  if (previous) {
    previous.contentObserver.disconnect();
    previous.widthObserver.disconnect();
    cancelAnimationFrame(previous.animationFrame);
  }

  let doc;
  try {
    doc = frame.contentDocument;
  } catch (e) {
    return;
  }
  if (!doc?.documentElement) return;

  const state = {
    contentObserver: null,
    widthObserver: null,
    animationFrame: 0,
    width: frame.clientWidth,
    isApplying: false,
  };

  const applyHeight = () => {
    state.isApplying = true;
    block.style.minHeight = '0';
    frame.style.minHeight = '0';
    frame.style.height = '0';
    // Flush the parent layout so the document reflows at the collapsed size
    frame.getBoundingClientRect();

    const height = measureDocumentHeight(doc);
    const value = height ? `${height}px` : '';
    frame.style.height = value;
    block.style.height = value;

    // Our own writes resize the framed document; ignore that echo
    requestAnimationFrame(() => {
      state.isApplying = false;
    });
  };

  const scheduleUpdate = () => {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(applyHeight);
  };

  state.contentObserver = new ResizeObserver(() => {
    if (state.isApplying) return;
    scheduleUpdate();
  });
  if (doc.body) state.contentObserver.observe(doc.body);

  state.widthObserver = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === state.width) return;
    state.width = width;
    scheduleUpdate();
  });
  state.widthObserver.observe(frame);

  frameResizeObservers.set(frame, state);
  scheduleUpdate();
}

/**
 * Recover when Hybris redirects the embedded login to the EDS homepage.
 * Without this guard the homepage recursively renders inside the iframe until
 * the user refreshes the outer page.
 * @param {HTMLIFrameElement} frame
 * @param {string} src
 * @returns {boolean} Whether the frame is still on a storefront route
 */
function ensureStorefrontRoute(frame, src) {
  try {
    const { pathname } = frame.contentWindow.location;
    if (pathname && !pathname.startsWith('/fmstorefront/')) {
      frame.contentWindow.location.replace(src);
      return false;
    }
  } catch (e) {
    // Cross-origin frames cannot be inspected; leave normal frame handling in place.
  }
  return true;
}

/**
 * Keep the section background full width while constraining its block layout.
 * Idempotent: re-running adopts wrappers from blocks that decorated later.
 * @param {Element} section
 */
function wrapStorefrontLayout(section) {
  const unwrapped = section.querySelectorAll(HERO_WRAPPER_SELECTOR);
  if (!unwrapped.length) return;

  let layout = section.querySelector(':scope > .hybris-storefront-layout');
  if (!layout) {
    layout = document.createElement('div');
    layout.className = 'hybris-storefront-layout';
    unwrapped[0].before(layout);
  }
  unwrapped.forEach((wrapper) => layout.append(wrapper));
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const link = block.querySelector('a');
  const textUrl = block.textContent.trim();
  const raw = link?.href
    || (textUrl.startsWith('http') || textUrl.startsWith('/') ? textUrl : '')
    || STOREFRONT.iframe;

  const src = toSameOriginSrc(raw);

  const section = block.closest('.section');
  if (section) {
    // columns-promo scopes its compact hero card on .sign-in-container
    section.classList.add('sign-in-container');
    section.dataset.storefrontMode = 'anonymous';
    wrapStorefrontLayout(section);
  }

  const reachable = await isStorefrontReachable(src);
  if (!reachable) {
    showProxyHint(block, src);
    return;
  }

  // Sibling blocks may have decorated during the reachability check
  if (section) wrapStorefrontLayout(section);

  const frame = document.createElement('iframe');
  frame.className = 'hybris-storefront-frame';
  frame.src = src;
  frame.title = 'DRiV account and rewards';
  frame.setAttribute('scrolling', 'no');
  frame.setAttribute('loading', 'lazy');

  block.replaceChildren(frame);

  frame.addEventListener('load', () => {
    if (!ensureStorefrontRoute(frame, src)) return;
    syncAuthLayout(block, frame);
    bindLoginReturn(frame);
    bindFrameHeight(block, frame);
  });

  // First paint may race CSS; sync once DOM is ready inside the frame
  requestAnimationFrame(() => syncAuthLayout(block, frame));
}
