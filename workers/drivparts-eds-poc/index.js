/**
 * Temporary POC front door for the DrivParts EDS + Hybris iframe integration.
 *
 * The Worker serves EDS pages by default and routes the Hybris storefront and
 * OCC paths to QA under the same workers.dev origin. This keeps the iframe
 * same-origin for the POC, so the existing iframe block can use its relative
 * /fmstorefront/... source and inspect only the same-origin storefront state.
 *
 * Hybris rejects POSTs whose Origin is workers.dev ("Invalid CORS request").
 * Upstream requests present as same-origin QA traffic (same as
 * tools/fmstorefront-proxy.mjs).
 *
 * This is not a production proxy. Do not cache authenticated Hybris paths or
 * expose credentials, cookies, tokens, or account data in logs.
 */

const EDS_ORIGIN = 'https://feature-thrishan--driv--adobedrago.aem.page';
const HYBRIS_ORIGIN = 'https://qa.drivparts.com';

/**
 * EDS page that frames the Hybris storefront (hybris-storefront block). Header
 * sign-in must land here — not on the raw /fmstorefront/.../iframe document,
 * which Hybris renders without the EDS header/footer.
 */
const EDS_HOME = '/drivparts/';

const HYBRIS_PATHS = [
  '/fmstorefront/',
  '/medias/',
  '/fmwebservice/',
  '/content/dam/',
];

/** Hosts Hybris/Imperva may put in Location / HTML that must stay on this Worker. */
const STOREFRONT_HOST_REWRITES = [
  HYBRIS_ORIGIN,
  'https://qa.drivparts.com',
  'http://qa.drivparts.com',
  'https://storeqa.drivparts.com',
  'http://storeqa.drivparts.com',
  'https://www.drivparts.com',
  'http://www.drivparts.com',
];

function isHybrisPath(pathname) {
  return HYBRIS_PATHS.some((prefix) => pathname.startsWith(prefix))
    || pathname === '/_Incapsula_Resource';
}

function getUpstreamOrigin(pathname) {
  return isHybrisPath(pathname) ? HYBRIS_ORIGIN : EDS_ORIGIN;
}

/**
 * @param {string} value
 * @param {string} publicOrigin
 * @returns {string}
 */
function rewriteStorefrontUrls(value, publicOrigin) {
  return STOREFRONT_HOST_REWRITES.reduce(
    (out, host) => out.replaceAll(host, publicOrigin),
    value,
  );
}

/**
 * @param {Request} request
 * @param {string} publicOrigin
 * @param {boolean} isHybris
 * @returns {Headers}
 */
function buildUpstreamHeaders(request, publicOrigin, isHybris) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  if (!isHybris) {
    headers.delete('content-length');
    return headers;
  }

  // Drop browser CORS/fetch metadata — Hybris treats workers.dev Origin as
  // cross-origin and responds "Invalid CORS request".
  headers.delete('origin');
  [...headers.keys()].forEach((key) => {
    if (key.toLowerCase().startsWith('sec-fetch-')) headers.delete(key);
  });

  headers.set('origin', HYBRIS_ORIGIN);
  const referer = headers.get('referer') || `${HYBRIS_ORIGIN}/`;
  headers.set('referer', referer.replaceAll(publicOrigin, HYBRIS_ORIGIN));
  headers.set('sec-fetch-site', 'same-origin');
  headers.set('sec-fetch-mode', 'navigate');
  headers.set('sec-fetch-dest', 'document');
  return headers;
}

function getIframeReferer(referer, publicOrigin) {
  try {
    const url = new URL(referer);
    if (url.origin === publicOrigin
      && /\/fmstorefront\/.*\/iframe/i.test(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
  } catch (error) {
    // Invalid or absent Referer; use the upstream redirect unchanged.
  }
  return '';
}

/**
 * Header sign-in links carry ?redirect=<eds-path> (see header.js). After login
 * send the browser back to that EDS page so the storefront renders framed with
 * the EDS header/footer. Only same-origin paths are honored — never a raw
 * /fmstorefront/... target (that is the bare Hybris document) and never a
 * protocol-relative //host value (open-redirect guard).
 * @param {string} referer
 * @param {string} publicOrigin
 * @returns {string}
 */
function getSignInRedirect(referer, publicOrigin) {
  try {
    const url = new URL(referer, publicOrigin);
    if (!/\/sign-in\b/i.test(url.pathname)) return '';
    const target = url.searchParams.get('redirect') || '';
    if (!target.startsWith('/') || target.startsWith('//')) return '';
    if (/^\/fmstorefront\//i.test(target)) return '';
    return target;
  } catch (error) {
    return '';
  }
}

/**
 * Keep the browser on this Worker origin so session cookies stay attached.
 * Login recovery: legacy AEM post-login targets → homepage/iframe for Emulate.
 * Authenticated Add to Cart → /cart must stay on /cart (do not bounce to `/`).
 * @param {string} value
 * @param {string} publicOrigin
 * @param {string} referer
 * @returns {string}
 */
function rewriteLocation(value, publicOrigin, referer) {
  const location = rewriteStorefrontUrls(value, publicOrigin);
  const iframeReferer = getIframeReferer(referer, publicOrigin);
  // Header sign-in → back to the framing EDS page (?redirect=), else /drivparts/.
  // Login from inside the iframe keeps priority via iframeReferer below.
  const signInTarget = `${publicOrigin}${getSignInRedirect(referer, publicOrigin) || EDS_HOME}`;

  let fromSignIn = false;
  try {
    fromSignIn = /\/sign-in\b/i.test(new URL(referer, publicOrigin).pathname);
  } catch (error) {
    fromSignIn = false;
  }

  const url = new URL(location, publicOrigin);
  const isLegacyAem = /\/content\/loc-|fmmp-corporate/i.test(url.pathname);
  // /content/loc-* is not proxied to Hybris — keep storefront session probes
  // (CSRF fetch, post-login) on /fmstorefront instead of EDS 404 HTML.
  if (isLegacyAem) return iframeReferer || signInTarget;

  // Non-login flows (including Add to Cart → /cart): origin rewrite only.
  if (!fromSignIn && !iframeReferer) return location;

  const isSiteRoot = url.origin === publicOrigin && url.pathname === '/';
  // Keep /cart after sign-in so a restored add-to-cart request can show items.
  const isCart = /\/cart\b/i.test(url.pathname);

  if (isCart) return location;
  if (!(isSiteRoot)) return location;
  if (iframeReferer) return iframeReferer;
  return signInTarget;
}

function rewriteCookie(value) {
  // Hybris sometimes sends JSESSIONID="" to clear the cookie — ignore that
  // or the browser drops the emulated session and the cart looks empty.
  if (/^JSESSIONID="";/i.test(value) || /^JSESSIONID=;\s*Expires=/i.test(value)) {
    return null;
  }
  // Keep the Hybris session on this Worker host. Broaden Path so cart + OCC
  // (/fmwebservice) share the same JSESSIONID; always set SameSite=Lax.
  let cookie = value
    .replace(/;\s*domain=[^;]*/gi, '')
    .replace(/;\s*samesite=[^;]*/gi, '');
  if (/^JSESSIONID=/i.test(cookie) || /^acceleratorSecureGUID=/i.test(cookie)) {
    cookie = cookie.replace(/;\s*path=[^;]*/gi, '');
    cookie = `${cookie}; Path=/`;
  }
  return `${cookie}; SameSite=Lax`;
}

function rewriteFrameHeaders(headers, isHybris) {
  if (!isHybris) return;

  headers.delete('x-frame-options');
  ['content-security-policy', 'content-security-policy-report-only'].forEach((name) => {
    const value = headers.get(name);
    if (value == null) return;
    const rewritten = value.replace(/frame-ancestors[^;]*;?/gi, '').trim();
    if (rewritten) headers.set(name, rewritten);
    else headers.delete(name);
  });
}

function isTextResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return /text\/|application\/(javascript|json|xhtml\+xml)/i.test(contentType);
}

async function rewriteTextResponse(response, publicOrigin) {
  if (!isTextResponse(response)) return response;

  const body = await response.text();
  // Strip clear=true from iframe URLs (plain + HTML-entity &). clear=true can
  // reset the Hybris session/cart after Add to Cart.
  const rewritten = rewriteStorefrontUrls(body, publicOrigin)
    .replace(/iframe\?clear=true(?:&amp;|&#x26;|&)?/gi, 'iframe?');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-length', String(new TextEncoder().encode(rewritten).length));
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyRequest(request, upstreamOrigin, publicOrigin, isHybris) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    upstreamOrigin,
  );

  const headers = buildUpstreamHeaders(request, publicOrigin, isHybris);
  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  // Buffer POSTs (add-to-cart form). Streaming the body without a reliable
  // Content-Length often arrives empty at Hybris/Imperva → cart page with
  // "There are no items added to cart".
  if (!['GET', 'HEAD'].includes(request.method)) {
    const body = await request.arrayBuffer();
    init.body = body;
    headers.set('content-length', String(body.byteLength));
  } else {
    headers.delete('content-length');
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, init);
  } catch (error) {
    return new Response('Bad Gateway', { status: 502 });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  const location = responseHeaders.get('location');
  if (location) {
    responseHeaders.set('location', rewriteLocation(
      location,
      publicOrigin,
      request.headers.get('referer') || '',
    ));
  }

  if (isHybris) {
    const cookies = upstreamResponse.headers.getSetCookie();
    if (cookies.length) {
      responseHeaders.delete('set-cookie');
      cookies.forEach((cookie) => {
        const rewritten = rewriteCookie(cookie);
        if (rewritten) responseHeaders.append('set-cookie', rewritten);
      });
    }
    responseHeaders.set('cache-control', 'no-store');
  }

  rewriteFrameHeaders(responseHeaders, isHybris);

  let response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  // Rewrite hosts + strip iframe clear=true for both EDS and Hybris responses.
  response = await rewriteTextResponse(response, publicOrigin);
  return response;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const isHybris = isHybrisPath(url.pathname);
    const upstreamOrigin = getUpstreamOrigin(url.pathname);
    return proxyRequest(request, upstreamOrigin, url.origin, isHybris);
  },
};
