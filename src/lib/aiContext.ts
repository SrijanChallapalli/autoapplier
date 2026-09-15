import { AsyncLocalStorage } from "node:async_hooks";

// ---------------------------------------------------------------------------
// Per-request AI credentials (bring-your-own-key).
//
// On a shared deployment (e.g. Vercel) we don't want every visitor to share
// one server-side AI_GATEWAY_API_KEY — that would burn the owner's quota and
// expose their key. Instead each request may carry the caller's own key in a
// header; we stash it here for the duration of the request so the AI helpers
// in ai.ts can pick it up without threading it through every function.
//
// Resolution order everywhere: request credentials (this store) first, then
// the AI_GATEWAY_API_KEY / AI_MODEL environment variables as a fallback (handy
// for local dev and single-tenant deploys).
// ---------------------------------------------------------------------------

export interface AiCredentials {
  apiKey?: string;
  model?: string;
}

// Header names the client uses to pass its key/model along with a request.
export const AI_KEY_HEADER = "x-ai-gateway-key";
export const AI_MODEL_HEADER = "x-ai-model";

const storage = new AsyncLocalStorage<AiCredentials>();

// The credentials for the current request, or {} outside a request scope.
export function getAiCredentials(): AiCredentials {
  return storage.getStore() ?? {};
}

export function runWithAiCredentials<T>(creds: AiCredentials, fn: () => T): T {
  return storage.run(creds, fn);
}

// Pull BYOK credentials out of a request's headers.
export function aiCredentialsFromHeaders(headers: Headers): AiCredentials {
  const apiKey = headers.get(AI_KEY_HEADER)?.trim() || undefined;
  const model = headers.get(AI_MODEL_HEADER)?.trim() || undefined;
  return { apiKey, model };
}

// Wrap a route handler so any AI call inside it sees the caller's own key.
export function withAiCredentials<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithAiCredentials(aiCredentialsFromHeaders(req.headers), fn);
}
