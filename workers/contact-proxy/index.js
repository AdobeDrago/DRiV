const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname !== '/submit') {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const incoming = await request.formData();
    incoming.set('access_key', env.WEB3FORMS_ACCESS_KEY);

    const upstream = await fetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: incoming,
    });

    const headers = {
      ...CORS_HEADERS,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    };
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
