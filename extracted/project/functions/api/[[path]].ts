// Cloudflare Pages Function: proxy /api/* to the Worker.

interface Env {
  WORKER_URL: string;
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const workerUrl = (context.env.WORKER_URL || '').replace(/\/$/, '');
  const target = `${workerUrl}${url.pathname}${url.search}`;
  const headers = new Headers(context.request.headers);
  // forward
  const init: RequestInit = {
    method: context.request.method,
    headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD' ? context.request.body : undefined,
    // @ts-ignore
    duplex: 'half',
  };
  const res = await fetch(target, init);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
