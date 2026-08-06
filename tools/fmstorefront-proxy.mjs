#!/usr/bin/env node
/**
 * Local reverse proxy so the Hybris storefront iframe can load on localhost.
 *
 * Why: qa.drivparts.com CSP frame-ancestors only allows itself (and a few
 * heavy-duty hosts). Embedding it from localhost:3000 / *.aem.page is blocked
 * ("refused to connect"). Same-origin /fmstorefront/* via this proxy fixes that.
 *
 * Usage (two terminals):
 *   aem up --port 3001 --no-open
 *   npm run proxy
 *
 * Then open http://localhost:3000/
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import zlib from 'zlib';

const LISTEN_PORT = Number(process.env.PROXY_PORT || 3000);
const AEM_ORIGIN = process.env.AEM_ORIGIN || 'http://127.0.0.1:3001';
const STOREFRONT_ORIGIN = process.env.STOREFRONT_ORIGIN || 'https://qa.drivparts.com';

/** Hosts Hybris/Imperva may put in Location / HTML that must stay on the proxy. */
const STOREFRONT_HOST_REWRITES = [
  STOREFRONT_ORIGIN,
  'https://qa.drivparts.com',
  'http://qa.drivparts.com',
  'https://storeqa.drivparts.com',
  'http://storeqa.drivparts.com',
  'https://www.drivparts.com',
  'http://www.drivparts.com',
];

/**
 * Map absolute Hybris/CDN URLs onto the local proxy origin so the browser
 * keeps the localhost session cookies (otherwise cart looks empty).
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
 * @param {import('http').IncomingHttpHeaders} headers
 * @param {string} [targetOrigin]
 * @returns {Record<string, string>}
 */
function requestHeaders(headers, targetOrigin = '') {
  const out = {};
  const publicOrigin = `http://localhost:${LISTEN_PORT}`;
  Object.entries(headers).forEach(([key, value]) => {
    if (value == null) return;
    const lower = key.toLowerCase();
    // Keep Content-Length so POSTed form bodies (add-to-cart) are not sent as
    // chunked — Spring/Imperva often drop or ignore chunked bodies.
    if (lower === 'host' || lower === 'connection') return;
    if (lower === 'accept-encoding') return;
    // Drop browser CORS/fetch metadata — Hybris/Imperva treat localhost Origin
    // as a cross-origin POST and respond "Invalid CORS request".
    if (lower === 'origin' || lower.startsWith('sec-fetch-')) return;
    out[key] = Array.isArray(value) ? value.join(',') : value;
  });
  // Always ask for plain bodies — we may rewrite headers and re-send length
  out['accept-encoding'] = 'identity';

  // When proxying to the storefront, present as same-origin traffic from QA
  // so add-to-cart form POSTs (and other mutations) are accepted.
  if (targetOrigin === STOREFRONT_ORIGIN) {
    out.origin = STOREFRONT_ORIGIN;
    const referer = out.referer || out.Referer || `${STOREFRONT_ORIGIN}/`;
    delete out.Referer;
    out.referer = String(referer).replaceAll(publicOrigin, STOREFRONT_ORIGIN);
    out['sec-fetch-site'] = 'same-origin';
    out['sec-fetch-mode'] = 'navigate';
    out['sec-fetch-dest'] = 'document';
  }
  return out;
}

/**
 * True only for the add-to-cart POST. When that request 302s to a legacy AEM
 * corporate path (CSR → emulating cart handover) we pin the browser to `/cart`.
 * Deliberately NOT matched for `/cart` itself: pinning a `/cart` request to
 * `/cart` is self-referential and loops until ERR_TOO_MANY_REDIRECTS.
 * @param {string} requestPath
 * @returns {boolean}
 */
function isCartFlow(requestPath) {
  return /\/fme-cat-cart\/entries\/add\b/i.test(requestPath);
}

/**
 * Cart line-item AJAX fragments (e.g. kitcontent) loaded by the storefront JS
 * via `$el.html(response)`. When these hit the proxy standalone, Hybris 302s
 * them to a legacy AEM path and the cart-pinning rule rewrites that to `/cart`.
 * The XHR then follows the redirect, receives the *entire* cart page (including
 * the footer `document.write(new Date().getFullYear())` script), and injecting
 * it post-load runs document.open() — wiping the page to just "2026". Returning
 * an empty 204 keeps `$el.html('')` a no-op so the cart stays rendered.
 * @param {string} requestPath
 * @returns {boolean}
 */
function isCartFragment(requestPath) {
  return /\/cart\/kitcontent\//i.test(requestPath);
}

/**
 * True when a candidate redirect target resolves to the same path we're already
 * serving (query string ignored). Used to break same-URL redirect loops.
 * @param {string} dest
 * @param {string} requestPath
 * @param {string} publicOrigin
 * @returns {boolean}
 */
function samePath(dest, requestPath, publicOrigin) {
  if (!dest || !requestPath) return false;
  try {
    return new URL(dest, publicOrigin).pathname
      === new URL(requestPath, publicOrigin).pathname;
  } catch {
    return false;
  }
}

/**
 * After login Hybris often redirects to a legacy AEM path (or /cart from the
 * Add-to-Cart sign-in redirect). Map that to a safe same-origin URL:
 * - iframe login → back into the iframe (Emulate Account loads in-frame)
 * - top-level sign-in → /drivparts/ so Emulate Account shows in the homepage iframe
 * - add-to-cart POST → pin legacy AEM handovers to /cart
 * - GET /cart → origin rewrite only (never bounce to EDS home — that "blinks" away)
 * Never bounce back to the same request path (ERR_TOO_MANY_REDIRECTS).
 * @param {string} location
 * @param {string} publicOrigin
 * @param {string} referer
 * @param {string} [requestPath]
 * @returns {string}
 */
function rewritePostLoginLocation(location, publicOrigin, referer, requestPath = '') {
  // Always keep the browser on the proxy host. Hybris often returns
  // https://storeqa.drivparts.com/... after cart/add — following that drops
  // localhost cookies and the Shopping Cart page looks empty.
  const loc = rewriteStorefrontUrls(location, publicOrigin);
  // DriveParts EDS shell — Emulate Account renders in the homepage iframe here.
  // Never send top-level header sign-in to /fmstorefront/.../iframe (raw Hybris).
  const edsHome = `${publicOrigin}/drivparts/`;
  const cartUrl = `${publicOrigin}/fmstorefront/federalmogul/en/USD/cart`;

  const iframeRef = /\/fmstorefront\/.*\/iframe/i.test(referer) ? referer : '';
  let fromSignIn = false;
  try {
    fromSignIn = /\/sign-in\b/i.test(new URL(referer, publicOrigin).pathname);
  } catch {
    fromSignIn = false;
  }

  // Never rewrite a Location to the path we're already serving — that turns a
  // single upstream 302 into an infinite same-URL redirect loop (the page
  // "blinks" until the browser trips ERR_TOO_MANY_REDIRECTS).
  const noLoop = (dest) => (samePath(dest, requestPath, publicOrigin) ? loc : dest);

  const url = new URL(loc, publicOrigin);
  const isLegacyAem = /\/content\/loc-|fmmp-corporate/i.test(url.pathname);
  if (isLegacyAem) {
    // Add-to-cart + cart subresources (kitcontent, etc.) must not escape to
    // /content/loc-* — that path is not proxied to Hybris locally.
    if (isCartFlow(requestPath) || /\/cart\//i.test(requestPath)) {
      return noLoop(cartUrl);
    }
    // Exact GET /cart → legacy: do not pass /content/loc-* through (lands on
    // local AEM 404/500). Prefer EDS home over a broken legacy URL.
    if (/\/cart\/?(\?|$)/i.test(requestPath)) {
      return noLoop(edsHome);
    }
    // Legacy AEM post-login: iframe login stays in-frame; header sign-in → EDS.
    return noLoop(iframeRef || edsHome);
  }

  // Only rewrite destinations for login recovery — not for add-to-cart / cart.
  if (!fromSignIn && !iframeRef) return loc;

  const isSiteRoot = /^https?:\/\/localhost:\d+\/?$/.test(loc)
    || loc === `${publicOrigin}/`
    || loc === edsHome
    || loc === `${publicOrigin}/drivparts`;
  const isPostLoginStorefront = fromSignIn
    && /\/fmstorefront\//i.test(loc)
    && !/\/sign-in\b/i.test(loc);

  if (!(isSiteRoot || isPostLoginStorefront)) return loc;

  if (iframeRef) return noLoop(iframeRef);
  // Top-level sign-in → Emulate Account on the DriveParts EDS homepage
  return noLoop(edsHome);
}

/**
 * @param {import('http').IncomingHttpHeaders} headers
 * @param {Buffer} body
 * @param {{ preserveLength?: boolean, referer?: string, requestPath?: string }} [opts]
 * @returns {Record<string, string | string[]>}
 */
function responseHeaders(headers, body, opts = {}) {
  const out = {};
  const publicOrigin = `http://localhost:${LISTEN_PORT}`;
  Object.entries(headers).forEach(([key, value]) => {
    if (value == null) return;
    const lower = key.toLowerCase();
    if (['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'].includes(lower)) {
      return;
    }
    // Avoid browsers caching a compressed variant after we decompress
    if (lower === 'vary') {
      const cleaned = String(value)
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v && !/^accept-encoding$/i.test(v))
        .join(', ');
      if (cleaned) out[key] = cleaned;
      return;
    }
    // Body was buffered/rewritten — replace length unless HEAD passthrough
    if (lower === 'content-length') {
      if (opts.preserveLength) out[key] = value;
      return;
    }
    if (lower === 'x-frame-options') return;
    if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
      const rewritten = String(value)
        .replace(/frame-ancestors[^;]*;?/gi, '')
        .trim();
      if (rewritten) out[key] = rewritten;
      return;
    }
    // Keep login/logout redirects on the proxy host (same-origin session)
    if (lower === 'location') {
      out[key] = rewritePostLoginLocation(
        String(value),
        publicOrigin,
        opts.referer || '',
        opts.requestPath || '',
      );
      return;
    }
    if (lower === 'set-cookie') {
      out[key] = (Array.isArray(value) ? value : [value])
        .filter((c) => !/^JSESSIONID="";/i.test(c) && !/^JSESSIONID=;\s*Expires=/i.test(c))
        .map((c) => {
        let cookie = c
          .replace(/;\s*domain=[^;]*/gi, '')
          .replace(/;\s*secure/gi, '')
          .replace(/;\s*samesite=[^;]*/gi, '');
        if (/^JSESSIONID=/i.test(cookie) || /^acceleratorSecureGUID=/i.test(cookie)) {
          cookie = cookie.replace(/;\s*path=[^;]*/gi, '');
          cookie = `${cookie}; Path=/`;
        }
        return `${cookie}; SameSite=Lax`;
      });
      return;
    }
    out[key] = value;
  });
  if (!opts.preserveLength) {
    out['content-length'] = String(body.length);
  }
  return out;
}

/**
 * @param {import('http').IncomingMessage} upRes
 * @returns {Promise<Buffer>}
 */
function readBody(upRes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    upRes.on('data', (c) => chunks.push(c));
    upRes.on('end', () => {
      const buf = Buffer.concat(chunks);
      const encoding = (upRes.headers['content-encoding'] || '').toLowerCase();
      const inflate = (fn) => fn(buf, (err, out) => (err ? reject(err) : resolve(out)));
      if (encoding === 'gzip' || encoding === 'x-gzip') {
        inflate(zlib.gunzip);
      } else if (encoding === 'deflate') {
        inflate(zlib.inflate);
      } else if (encoding === 'br') {
        inflate(zlib.brotliDecompress);
      } else if (buf.length >= 3 && buf[0] === 0x1f && buf[1] === 0x8b) {
        // gzip magic without Content-Encoding (misconfigured upstream)
        inflate(zlib.gunzip);
      } else if (buf.length >= 2 && buf[0] === 0x1b && buf[1] === 0x19) {
        // brotli often starts 1b 19… when AE is ignored but CE omitted
        inflate(zlib.brotliDecompress);
      } else {
        resolve(buf);
      }
    });
    upRes.on('error', reject);
  });
}

/**
 * Rewrite absolute Hybris hosts inside HTML/JS so in-page redirects and form
 * actions stay on localhost (same session as Add to Cart).
 * @param {Buffer} body
 * @param {string} contentType
 * @param {string} publicOrigin
 * @returns {Buffer}
 */
function rewriteStorefrontBody(body, contentType, publicOrigin) {
  const ct = (contentType || '').toLowerCase();
  if (!/text\/html|text\/javascript|application\/javascript|application\/json/.test(ct)) {
    return body;
  }
  const text = body.toString('utf8');
  const rewritten = rewriteStorefrontUrls(text, publicOrigin)
    .replace(/iframe\?clear=true(?:&amp;|&#x26;|&)?/gi, 'iframe?');
  return rewritten === text ? body : Buffer.from(rewritten, 'utf8');
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer|null>}
 */
function readIncomingBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} targetOrigin
 */
async function proxyRequest(req, res, targetOrigin) {
  const target = new URL(req.url || '/', targetOrigin);
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;
  const publicOrigin = `http://localhost:${LISTEN_PORT}`;

  let requestBody = null;
  try {
    requestBody = await readIncomingBody(req);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[proxy] request body error', err.message);
    if (!res.headersSent) res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  const headers = requestHeaders(req.headers, targetOrigin);
  headers.host = target.host;
  if (requestBody) {
    headers['content-length'] = String(requestBody.length);
  } else {
    delete headers['content-length'];
  }

  const upstream = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    async (upRes) => {
      try {
        const headerOpts = {
          referer: req.headers.referer,
          requestPath: `${target.pathname}${target.search}`,
        };
        // HEAD/304: no body — keep upstream Content-Length
        if (req.method === 'HEAD' || upRes.statusCode === 304) {
          const outHeaders = responseHeaders(upRes.headers, Buffer.alloc(0), {
            ...headerOpts,
            preserveLength: true,
          });
          res.writeHead(upRes.statusCode || 502, outHeaders);
          res.end();
          return;
        }
        // Cart fragment XHR that upstream redirects: answer 204 instead of a
        // rewritten redirect, so the storefront's `$el.html(response)` receives
        // nothing rather than the full cart page (whose footer document.write
        // would wipe the DOM to "2026" — the Add to Cart "blink").
        const status = upRes.statusCode || 0;
        if (isCartFragment(headerOpts.requestPath) && status >= 300 && status < 400) {
          upRes.resume();
          res.writeHead(204, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        let body = await readBody(upRes);
        if (targetOrigin === STOREFRONT_ORIGIN) {
          body = rewriteStorefrontBody(
            body,
            String(upRes.headers['content-type'] || ''),
            publicOrigin,
          );
        }
        res.writeHead(upRes.statusCode || 502, responseHeaders(upRes.headers, body, headerOpts));
        res.end(body);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[proxy] body error', err.message);
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`Bad gateway: ${err.message}`);
      }
    },
  );

  upstream.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[proxy]', targetOrigin, err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Bad gateway: ${err.message}`);
  });

  if (requestBody) upstream.end(requestBody);
  else upstream.end();
}

const server = http.createServer((req, res) => {
  const path = req.url || '/';
  // Hybris HTML + assets. /medias holds CMS images (e.g. Get More promo tout).
  // /fmwebservice is the OCC API used for authenticated mini-cart entries.
  if (path.startsWith('/fmstorefront')
    || path.startsWith('/medias')
    || path.startsWith('/fmwebservice')
    || path.startsWith('/content/dam')) {
    proxyRequest(req, res, STOREFRONT_ORIGIN);
    return;
  }
  proxyRequest(req, res, AEM_ORIGIN);
});

server.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`
Storefront proxy listening on http://localhost:${LISTEN_PORT}
  /fmstorefront/*  →  ${STOREFRONT_ORIGIN}  (framing headers stripped)
  /fmwebservice/*  →  ${STOREFRONT_ORIGIN}  (OCC cart / auth APIs)
  /medias/*        →  ${STOREFRONT_ORIGIN}  (promo images, etc.)
  /content/dam/*   →  ${STOREFRONT_ORIGIN}  (product placeholders)
  /*               →  ${AEM_ORIGIN}

Keep AEM on 3001:  aem up --port 3001 --no-open
Open: http://localhost:${LISTEN_PORT}/
`);
});
