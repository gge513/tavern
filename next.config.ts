import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The private room was briefly routed at /tavern before the product
    // itself became the Tavern; old notification links still point there.
    return [
      {
        source: "/tavern",
        destination: "/snug",
        permanent: true,
      },
      {
        source: "/tavern/:id",
        destination: "/snug/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
