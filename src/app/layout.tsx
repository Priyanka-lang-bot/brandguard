import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrandGuard — check content against your brand before it goes live",
  description: "Pre-publication brand checks with cited findings, suggested fixes and human approval.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
