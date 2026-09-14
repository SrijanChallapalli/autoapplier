import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The JSON store writes under ./data at runtime in dev. For production you
  // would swap the repository layer in src/lib/store.ts for a real database.
  serverExternalPackages: [],
};

export default nextConfig;
