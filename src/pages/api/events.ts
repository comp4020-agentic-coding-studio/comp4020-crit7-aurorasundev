import type { APIRoute } from "astro";
import { bus, type ChangeEvent } from "../../lib/events";

// Server-sent events: pages showing a plan or invitation listen here and
// offer a refresh when the other demo student changes something. The CI
// deploy probe also expects the opening comment from this endpoint.
export const GET: APIRoute = () => {
  let onChange: (event: ChangeEvent) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (event) => {
        controller.enqueue(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
      };
      bus.on("change", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("change", onChange);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
