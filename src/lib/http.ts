// Small client-side fetch helpers.
//
// The bare `fetch(url).then(r => r.json())` pattern has two failure modes that
// leave the UI stuck: a network error rejects the promise (so a `loading` flag
// never clears), and a 500 that returns an HTML error page makes `.json()`
// throw an opaque parse error. `getJson` normalizes both into one thrown Error
// with a useful message, so callers can show a real "couldn't load — retry"
// state instead of an infinite spinner.

export async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}). Please try again.`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error("Got an unexpected response from the server.");
  }
}
