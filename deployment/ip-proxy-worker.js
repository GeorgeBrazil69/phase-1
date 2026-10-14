// Optional Cloudflare front door. Set ORIGIN_URL and PROXY_SECRET as secrets.
// request.cf.timezone is inferred from the connecting IP, including VPN exits.
export default {
  async fetch(request, env) {
    const source = new URL(request.url);
    const target = new URL(source.pathname + source.search, env.ORIGIN_URL);
    const headers = new Headers(request.headers);
    headers.delete('x-still-proxy-secret'); headers.delete('x-still-timezone'); headers.delete('x-still-client-ip');
    const timezone = request.cf?.timezone, ip = request.headers.get('cf-connecting-ip');
    if (!timezone || !ip) return new Response('IP location unavailable.', { status: 503 });
    headers.set('x-still-proxy-secret', env.PROXY_SECRET);
    headers.set('x-still-timezone', timezone);
    headers.set('x-still-client-ip', ip);
    return fetch(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  }
};
