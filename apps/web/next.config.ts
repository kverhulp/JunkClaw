import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them in place.
  transpilePackages: [
    "@junkclaw/schema",
    "@junkclaw/core",
    "@junkclaw/db",
    "@junkclaw/agents",
  ],
  serverExternalPackages: ["postgres", "@mastra/pg", "@mastra/core"],
};

export default nextConfig;
