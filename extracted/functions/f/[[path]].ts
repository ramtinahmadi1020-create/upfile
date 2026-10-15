interface Env { WORKER_URL: string; }
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const workerUrl = (context.env.WORKER_URL || '').replace(/\/$/, '');
  const target = `${workerUrl}${url.pathname}${url.search}`;
  const res = await fetch(target, { method: context.request.method, headers: context.request.headers, body: context.request.method !== 'GET' && context.request.method !== 'HEAD' ? context.request.body : undefined, duplex: 'half' } as RequestInit);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
