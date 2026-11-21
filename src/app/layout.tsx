import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";

export const metadata: Metadata = {
  title: "BrandGuard — check content against your brand before it goes live",
  description: "Pre-publication brand checks with cited findings, suggested fixes and human approval.",
};

export const viewport: Viewport = {
  themeColor: [{ color: "#0f1012" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark is the default theme: the CSS treats any <html> without data-theme="light" as dark, so React never
    // renders the attribute. ThemeScript sets it from the saved choice before first paint; suppressHydrationWarning
    // covers that attribute.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* First in <body> and blocking, so it runs before anything visible is parsed or painted. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
