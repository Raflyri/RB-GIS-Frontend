import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/pwa/PwaRegister";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Sistem Web GIS Digitalisasi Tanah LDKH",
  applicationName: "GIS LDKH",
  description:
    "Platform pemetaan spasial PostGIS/MapLibre yang terintegrasi dengan arsip dokumen legal OCR di Synology NAS & Nextcloud.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GIS LDKH",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-[100dvh] bg-slate-50 text-slate-800 antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
