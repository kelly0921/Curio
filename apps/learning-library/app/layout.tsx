import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curio — save what sparks you",
  description: "Save interesting links in one action. Curio finds the useful ideas and gathers related discoveries for you.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Curio" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
