import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "Clothing Business Manager",
  description:
    "Complete business management system for clothing brands — inventory, sales, purchases, payments, production, accounts and reports.",
  icons: {
    icon: "/logo.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  // iOS PWA install support + mobile browser behaviour
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Clothing Business Manager",
  },
      // Prevent iOS from auto-linking phone numbers / addresses
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Rendered as <meta name="theme-color"> & <meta name="color-scheme"> — consumed
  // by mobile browsers for the address-bar status tint and iOS install prompt,
  // and kept in sync with the web app manifest.
  themeColor: "#0f766e",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground overflow-hidden"
        style={{ fontFamily: '"Segoe UI", "Segoe UI Variable", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif' }}
      >
        <AppProviders>
          {children}
        </AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
