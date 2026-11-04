import type { Metadata } from "next";
import "./globals.css";
import WorkspaceHost from "./WorkspaceHost";

export const metadata: Metadata = {
  title: "CLM DASHBOARD",
  description: "ColorME dashboard built with Next.js and Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><WorkspaceHost>{children}</WorkspaceHost></body>
    </html>
  );
}
