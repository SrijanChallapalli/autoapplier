import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Storage backend abstraction. The whole app persists a handful of JSON
// documents keyed by collection name ("profile", "jobs", ...). Swapping where
// those documents live is a single choice here:
//   - no DATABASE_URL  -> file backend (JSON under ./data, or /tmp on Vercel)
//   - DATABASE_URL set -> Postgres/Neon backend (one JSONB row per key)
// store.ts is written entirely on top of this interface.
// ---------------------------------------------------------------------------

export interface Backend {
  read<T>(key: string, fallback: T): Promise<T>;
  write(key: string, value: unknown): Promise<void>;
}

// Minimal client shape shared by node-postgres Pool and PGlite, so the pg
// backend can be unit-tested against an in-process database.
export interface QueryClient {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

// --- File backend ----------------------------------------------------------

export function createFileBackend(dir: string): Backend {
  const fileFor = (key: string) => path.join(dir, `${key}.json`);
  return {
    async read<T>(key: string, fallback: T): Promise<T> {
      try {
        return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
      } catch {
        return fallback;
      }
    },
    async write(key: string, value: unknown): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
      const file = fileFor(key);
      const tmp = `${file}.${process.pid}.${Math.random()
        .toString(36)
        .slice(2)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
      await fs.rename(tmp, file);
    },
  };
}

// --- Postgres backend ------------------------------------------------------

const TABLE = "autoapplier_kv";

export function createPgBackend(client: QueryClient): Backend & {
  init(): Promise<void>;
} {
  let ready: Promise<void> | null = null;
  const init = () => {
    if (!ready) {
      ready = client
        .query(
          `CREATE TABLE IF NOT EXISTS ${TABLE} (k text PRIMARY KEY, v jsonb NOT NULL)`,
        )
        .then(() => undefined);
    }
    return ready;
  };
  return {
    init,
    async read<T>(key: string, fallback: T): Promise<T> {
      await init();
      const { rows } = await client.query(
        `SELECT v FROM ${TABLE} WHERE k = $1`,
        [key],
      );
      if (!rows.length) return fallback;
      return (rows[0] as { v: T }).v;
    },
    async write(key: string, value: unknown): Promise<void> {
      await init();
      await client.query(
        `INSERT INTO ${TABLE} (k, v) VALUES ($1, $2::jsonb)
         ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
        [key, JSON.stringify(value)],
      );
    },
  };
}

// --- Selection (memoized singleton) ----------------------------------------

let backendPromise: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (url) {
      // Lazy-load pg so file-only deployments don't need it at runtime.
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: url,
        // Neon and most hosted PG require TLS.
        ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
        max: 3,
      });
      const pg = createPgBackend(pool);
      await pg.init();
      return pg;
    }
    const dir =
      process.env.AUTOAPPLIER_DATA_DIR ||
      (process.env.VERCEL
        ? path.join("/tmp", "autoapplier-data")
        : path.join(process.cwd(), "data"));
    return createFileBackend(dir);
  })();
  return backendPromise;
}

// Test hook: inject a backend directly (used by unit tests with PGlite).
export function __setBackendForTests(b: Backend | null): void {
  backendPromise = b ? Promise.resolve(b) : null;
}
