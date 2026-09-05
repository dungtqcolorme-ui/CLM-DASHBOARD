import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/dashboard/shell": ["./dashboard/clm-dashboard-private-34.html"],
  },
};

export default nextConfig;
