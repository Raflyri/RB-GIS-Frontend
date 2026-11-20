import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistem Web GIS Digitalisasi Tanah LDKH",
  description:
    "Platform pemetaan spasial PostGIS/MapLibre yang terintegrasi dengan arsip dokumen legal OCR di Synology NAS & Nextcloud.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
