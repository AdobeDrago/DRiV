/**
 * Reverse-proxies the Hybris storefront (/fmstorefront/*, /medias/*) so it can be
 * embedded as a same-origin iframe (see blocks/drivparts/hybris-storefront/). Hybris sends
 * X-Frame-Options and a CSP frame-ancestors directive that only allow same-origin
 * framing — this worker strips/rewrites those, plus Location and Set-Cookie, the
 * same way tools/fmstorefront-proxy.mjs does for local dev.
 *
 * Not yet bound to a Worker Route (see wrangler.toml) — deployed to *.workers.dev
 * only until the production zone/domain is decided.
 */

const STOREFRONT_ORIGIN = 'https://qa.drivparts.com';

function buildUpstreamHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  return headers;
}

function stripFrameAncestors(value) {
  return value.replace(/frame-ancestors[^;]*;?/gi, '').trim();
}

// Keep Hybris login/logout redirects on this worker's own host so the session
// stays same-origin, mirroring tools/fmstorefront-proxy.mjs's Location rewrite.
function rewriteLocation(rawLocation, publicOrigin, referer) {
  let loc = rawLocation
    .replaceAll(STOREFRONT_ORIGIN, publicOrigin)
    .replaceAll('http://qa.drivparts.com', publicOrigin)
    .replaceAll('https://www.drivparts.com', publicOrigin);

  const iframeRef = /\/fmstorefront\/.*\/iframe/i.test(referer) ? referer : '';

  // Hybris posts back to legacy AEM homepage paths after login — send it back to
  // the iframe (or the referring EDS page) instead of navigating the frame there.
  if (/\/content\/loc-|\/content\/dam\/|fmmp-corporate/i.test(loc)) {
    loc = iframeRef
      || (referer.startsWith(publicOrigin) && !/\/content\//i.test(referer) ? referer : `${publicOrigin}/`);
  } else if (new RegExp(`^${publicOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`).test(loc)) {
    if (iframeRef) {
      loc = iframeRef;
    } else if (referer.startsWith(publicOrigin) && !/\/fmstorefront\//i.test(referer)) {
      loc = referer;
    }
  }
  return loc;
}

// Domain= can't be honored by this worker's own host, so it's stripped; Secure is
// kept (unlike the local proxy) because this worker only ever serves over HTTPS.
function rewriteSetCookie(cookie) {
  return cookie
    .replace(/;\s*domain=[^;]*/gi, '')
    .replace(/;\s*samesite=[^;]*/gi, '; SameSite=Lax');
}

function buildResponseHeaders(upstreamResponse, publicOrigin, referer) {
  const headers = new Headers(upstreamResponse.headers);
  headers.delete('x-frame-options');

  ['content-security-policy', 'content-security-policy-report-only'].forEach((name) => {
    const value = headers.get(name);
    if (value == null) return;
    const rewritten = stripFrameAncestors(value);
    if (rewritten) headers.set(name, rewritten);
    else headers.delete(name);
  });

  const location = headers.get('location');
  if (location) headers.set('location', rewriteLocation(location, publicOrigin, referer));

  const setCookies = upstreamResponse.headers.getSetCookie();
  if (setCookies.length) {
    headers.delete('set-cookie');
    setCookies.forEach((cookie) => headers.append('set-cookie', rewriteSetCookie(cookie)));
  }

  return headers;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/fmstorefront') && !url.pathname.startsWith('/medias')) {
      return new Response('Not Found', { status: 404 });
    }

    const upstreamUrl = new URL(`${url.pathname}${url.search}`, STOREFRONT_ORIGIN);
    const init = {
      method: request.method,
      headers: buildUpstreamHeaders(request),
      redirect: 'manual',
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
      init.duplex = 'half';
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl.toString(), init);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[drivparts-hybris-proxy] upstream unreachable', upstreamUrl.toString(), err.message);
      return new Response('Bad Gateway', { status: 502 });
    }

    const referer = request.headers.get('referer') || '';
    const headers = buildResponseHeaders(upstreamResponse, url.origin, referer);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};
