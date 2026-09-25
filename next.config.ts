import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Every deploy is a fresh build, so build time is deploy time. Inlined
    // into both bundles, so server and client render the same value.
    BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
