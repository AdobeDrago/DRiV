/* eslint-disable no-console */
const MOOGPARTS_CATALOG_ORIGIN = 'https://www.moogparts.com/driv/partfinder';
const DRIVEPARTS_CATALOG_ORIGIN = 'https://www.drivparts.com/driv/partfinder';
const CROSS_SELL_ORIGIN = 'https://www.moogparts.com/content/loc-na/loc-us/fmmp-moog/en_US/find-my-part/find-my-part-results/jcr:content/main-par/cross_sell.by-tags';
const MOOGPARTS_FMMP_ORIGIN = 'https://www.moogparts.com/bin/fmmp/api';
const WHERE_TO_BUY_ORIGIN = 'https://www.drivparts.com/content/loc-na/loc-us/fmmp-corporate/en_US/where-to-buy/jcr:content/main-par/where_to_buy_search.search';
const CACHE_TTL = 604800; // 7 days
const STRIP_PARAMS = new Set(['no_cache', 'nocache']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function buildOriginUrl(base, incomingSearchParams) {
  const url = new URL(base);
  incomingSearchParams.forEach((value, key) => {
    if (!STRIP_PARAMS.has(key)) url.searchParams.set(key, value);
  });
  return url;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function proxyWithCache(originUrl, ctx) {
  const cacheKey = new Request(originUrl.toString());
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    console.log(`CACHE HIT  ${originUrl.toString()}`);
    // new Headers() is case-insensitive; plain object spread would duplicate CORS headers as '*, *'
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  }

  console.log(`CACHE MISS ${originUrl.toString()}`);
  let upstream;
  try {
    upstream = await fetch(originUrl.toString());
  } catch (e) {
    console.error(`UPSTREAM UNREACHABLE ${originUrl.toString()} ${e.message}`);
    return new Response(JSON.stringify({ error: 'Upstream unreachable' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  console.log(`UPSTREAM   ${upstream.status} ${originUrl.pathname}`);

  if (!upstream.ok) {
    console.error(`UPSTREAM ERROR ${upstream.status} ${originUrl.toString()}`);
  }

  const headers = {
    ...CORS_HEADERS,
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'X-Cache': 'MISS',
    ...(upstream.ok && { 'Cache-Control': `public, max-age=${CACHE_TTL}` }),
  };

  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function proxyPostWithCache(originUrl, body, ctx) {
  const cacheKeyUrl = new URL(originUrl.toString());
  cacheKeyUrl.searchParams.set('__ck', await sha256(body));
  const cacheKey = new Request(cacheKeyUrl.toString());
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    console.log(`CACHE HIT  ${originUrl.toString()}`);
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  }

  console.log(`CACHE MISS ${originUrl.toString()}`);
  const upstream = await fetch(originUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', Accept: 'application/json' },
    body,
  });
  console.log(`UPSTREAM   ${upstream.status} ${originUrl.pathname}`);

  if (!upstream.ok) {
    console.error(`UPSTREAM ERROR ${upstream.status} ${originUrl.toString()}`);
  }

  const headers = {
    ...CORS_HEADERS,
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'X-Cache': 'MISS',
    ...(upstream.ok && { 'Cache-Control': `public, max-age=${CACHE_TTL}` }),
  };

  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/fmmp/')) {
      const endpoint = url.pathname.slice('/fmmp/'.length);
      if (!endpoint) return new Response('Not Found', { status: 404 });
      if (request.method !== 'POST') {
        console.warn(`REJECTED ${request.method} ${url.pathname}`);
        return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
      }
      const body = await request.text();
      const originUrl = new URL(`${MOOGPARTS_FMMP_ORIGIN}/${endpoint}`);
      return proxyPostWithCache(originUrl, body, ctx);
    }

    if (request.method !== 'GET') {
      console.warn(`REJECTED ${request.method} ${url.pathname}`);
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    let originUrl;

    if (url.pathname.startsWith('/catalog/')) {
      const endpoint = url.pathname.slice('/catalog/'.length);
      if (!endpoint) return new Response('Not Found', { status: 404 });
      originUrl = buildOriginUrl(`${MOOGPARTS_CATALOG_ORIGIN}/${endpoint}`, url.searchParams);
    } else if (url.pathname.startsWith('/drivparts/')) {
      const endpoint = url.pathname.slice('/drivparts/'.length);
      if (!endpoint) return new Response('Not Found', { status: 404 });
      originUrl = buildOriginUrl(`${DRIVEPARTS_CATALOG_ORIGIN}/${endpoint}`, url.searchParams);
    } else if (url.pathname === '/cross-sell') {
      originUrl = buildOriginUrl(CROSS_SELL_ORIGIN, url.searchParams);
    } else if (url.pathname === '/wheretobuy') {
      originUrl = buildOriginUrl(WHERE_TO_BUY_ORIGIN, url.searchParams);
    } else {
      console.warn(`NOT FOUND ${url.pathname}`);
      return new Response('Not Found', { status: 404 });
    }

    return proxyWithCache(originUrl, ctx);
  },
};
