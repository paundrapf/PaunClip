import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingExcludes: {
    "*": [
      "./storage/**",
      "./docs/**",
      "./assets/**",
      "./dist/**",
      "./vendor/bin/**"
    ]
  }
};

export default nextConfig;
