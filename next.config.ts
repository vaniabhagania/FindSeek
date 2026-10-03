import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CV uploads go through a server action; allow a 4 MB file plus form overhead (Vercel caps requests at 4.5 MB).
      bodySizeLimit: "4.4mb",
    },
  },
};

export default nextConfig;
