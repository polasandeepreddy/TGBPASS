// Serves the static frontend (via assets) and proxies /api/* to the Flask backend at env.API_ORIGIN.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.API_ORIGIN) {
      return Response.json({ success: false, error: 'Backend is offline.' }, { status: 503 });
    }
    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const upstream = new Request(target, request);
    upstream.headers.delete('host');
    try {
      return await fetch(upstream);
    } catch (e) {
      return Response.json({ success: false, error: 'Backend is unreachable.' }, { status: 502 });
    }
  },
};
