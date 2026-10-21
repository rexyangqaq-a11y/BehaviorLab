import { randomUUID } from 'node:crypto';

/** Records actual invocations, including failures. Never fabricates a model call. */
export async function traced(store, specification, operation) {
  const id = `call_${randomUUID()}`;
  const traceId = specification.trace_id ?? id;
  store.beginCall({ ...specification, id, trace_id: traceId });
  try {
    const output = await operation({ id, trace_id: traceId });
    store.endCall(id, output, null);
    return output;
  } catch (error) {
    store.endCall(id, null, error);
    throw error;
  }
}
