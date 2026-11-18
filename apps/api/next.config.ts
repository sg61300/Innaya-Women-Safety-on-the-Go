import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  transpilePackages: ["@vaira/core"],
  // Crawler block (founder 2026-09-24): X-Robots-Tag on every route, including the
  // APK download. Humans are unaffected. See src/lib/securityHeaders.ts.
  async headers() {
    return securityHeaders();
  },
};

export default nextConfig;
