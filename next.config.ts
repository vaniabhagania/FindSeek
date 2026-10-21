import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // The "X-Powered-By: Next.js" header only tells scanners what to aim at.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          production: process.env.NODE_ENV === "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
    ];
  },
  experimental: {
    serverActions: {
      // CV uploads go through a server action; allow a 4 MB file plus form overhead (Vercel caps requests at 4.5 MB).
      bodySizeLimit: "4.4mb",
    },
  },
};

export default nextConfig;
