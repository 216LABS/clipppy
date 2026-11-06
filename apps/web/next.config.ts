import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@clipppy/contracts",
    "@clipppy/domain",
    "@clipppy/ingest",
    "@clipppy/publish",
    "@clipppy/jobs",
    "@clipppy/db",
  ],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
