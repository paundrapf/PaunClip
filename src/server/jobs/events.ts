import "server-only";
import { listJobEvents } from "./job-store";

export function createJobEventStream(jobId: string) {
  const encoder = new TextEncoder();
  let closed = false;
  let lastSeen: Date | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 1500\n\n"));

      while (!closed) {
        const events = await listJobEvents(jobId, lastSeen);
        for (const event of events) {
          lastSeen = event.createdAt;
          controller.enqueue(
            encoder.encode(
              `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({
                id: event.id,
                type: event.type,
                message: event.message,
                data: event.dataJson ? JSON.parse(event.dataJson) : null,
                createdAt: event.createdAt.toISOString()
              })}\n\n`
            )
          );
        }

        await sleep(1000);
      }
    },
    cancel() {
      closed = true;
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
