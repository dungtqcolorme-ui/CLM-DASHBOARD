import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "exceljs"],
  outputFileTracingIncludes: {
    "/api/dashboard/shell": ["./dashboard/clm-dashboard-private-34.html"],
    "/api/marketing/reports/export": ["./public/marketing/fonts/NotoSans-Regular.ttf", "./public/colorme-logo.png"],
  },
};

export default nextConfig;
