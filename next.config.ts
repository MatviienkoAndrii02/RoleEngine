import type { NextConfig } from "next";

// The console is reachable from the internet in the supported deployment, so admin paths get a
// small, explicit hardening set: never framed, never sniffed, never indexed, no referrer leaks.
const adminSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      { source: "/admin/:path*", headers: adminSecurityHeaders },
      { source: "/admin-api/:path*", headers: adminSecurityHeaders },
    ];
  },
};

export default nextConfig;
