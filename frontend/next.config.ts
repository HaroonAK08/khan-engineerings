import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/reports/finance",
        destination: "/dashboard/finance",
        permanent: false,
      },
      {
        source: "/dashboard/reports/finance/:path*",
        destination: "/dashboard/finance",
        permanent: false,
      },
      {
        source: "/dashboard/finance/production-margin",
        destination: "/dashboard/finance",
        permanent: false,
      },
      {
        source: "/dashboard/finance/profit",
        destination: "/dashboard/finance",
        permanent: false,
      },
      {
        source: "/dashboard/finance/expenses",
        destination: "/dashboard/finance",
        permanent: false,
      },
      {
        source: "/dashboard/finance/entries",
        destination: "/dashboard/finance",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;