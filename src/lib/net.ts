/**
 * No request may hang longer than this. A hung fetch would hold every later
 * poll and retry, which reuse the request in flight. Chosen, not derived.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A signal that aborts after `ms` with a `TimeoutError`, or earlier when
 * `signal` aborts, with its reason. A timeout is a failure the user sees;
 * a caller's abort stays silent.
 */
export function withTimeout(signal?: AbortSignal, ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), ms);
  const follow = () => {
    clearTimeout(timer);
    controller.abort(signal?.reason);
  };
  if (signal?.aborted) follow();
  else signal?.addEventListener('abort', follow, { once: true });
  return controller.signal;
}
