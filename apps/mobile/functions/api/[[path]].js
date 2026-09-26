const defaultProcessorOrigin = 'https://curio-processor.kellychenmeiyi.workers.dev';

export async function onRequest({ env, request }) {
  const processorOrigin = env.CURIO_PROCESSOR_ORIGIN || defaultProcessorOrigin;
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, processorOrigin);

  try {
    const upstreamRequest = new Request(upstreamUrl, request);
    return await fetch(upstreamRequest);
  } catch {
    return Response.json({
      ok: false,
      error: {
        code: 'PROCESSOR_UNREACHABLE',
        message: 'Curio could not reach its processor.',
      },
    }, { status: 502 });
  }
}
