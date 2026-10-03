import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/convert": ["./bin/typst*", "./assets/fonts/liberation-sans/*"],
  },
};

export default nextConfig;
