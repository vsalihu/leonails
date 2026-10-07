import type { Metadata, Viewport } from "next";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Rugile Nail Atelier, Wisbech", template: "%s | Rugile Nail Atelier" },
    description: "Gel, builder gel and nail art by appointment in Wisbech.",
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    // Temporary/staging deployments: keep every page out of search results.
    robots: process.env.SITE_NOINDEX === "true" ? { index: false, follow: false } : undefined,
  };
}

export const viewport: Viewport = {
  themeColor: "#F7F3EC",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
