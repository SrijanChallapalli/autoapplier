"use client";

// ---------------------------------------------------------------------------
// Bring-your-own-key bridge (client side).
//
// The user's AI Gateway key lives only in this browser's localStorage — it is
// never sent to our server to be stored. This installs a one-time fetch wrapper
// that attaches the key (and optional model) as headers on every same-origin
// /api/* request, so the AI routes use the caller's own key. On a shared
// deployment that means each visitor spends their own quota, not the owner's.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export const AI_KEY_LS = "autoapplier.aiGatewayKey";
export const AI_MODEL_LS = "autoapplier.aiModel";

const AI_KEY_HEADER = "x-ai-gateway-key";
const AI_MODEL_HEADER = "x-ai-model";

let installed = false;

function install() {
  if (installed || typeof window === "undefined" || !window.fetch) return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const isApi =
        url.startsWith("/api/") ||
        url.startsWith(window.location.origin + "/api/");

      if (isApi) {
        const key = localStorage.getItem(AI_KEY_LS);
        if (key) {
          const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          );
          headers.set(AI_KEY_HEADER, key);
          const model = localStorage.getItem(AI_MODEL_LS);
          if (model) headers.set(AI_MODEL_HEADER, model);
          return original(input, { ...init, headers });
        }
      }
    } catch {
      // fall through to an unmodified fetch on any error
    }
    return original(input, init);
  };
}

// Install as early as possible on the client (module import happens during the
// first client render, before child component effects fire).
install();

export function AiKeyBridge() {
  // Belt-and-suspenders: ensure it's installed after hydration too.
  useEffect(() => {
    install();
  }, []);
  return null;
}
