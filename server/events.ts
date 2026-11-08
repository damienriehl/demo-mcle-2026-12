import type { MatterStore } from './store';

/** Each SSE message is the complete current list, including derived deadline results. */
export function matterEvents(store: MatterStore, signal: AbortSignal): Response {
  let unsubscribe = () => {};
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (matters: ReturnType<MatterStore['list']>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(matters)}\n\n`));
      };
      const stop = () => {
        unsubscribe();
        controller.close();
      };
      const detach = store.subscribe(send);
      unsubscribe = () => { detach(); signal.removeEventListener('abort', stop); };
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      else send(store.list());
    },
    cancel() { unsubscribe(); },
  });
  return new Response(body, { headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  } });
}
