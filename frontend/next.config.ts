import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL || "http://127.0.0.1:5050").replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
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