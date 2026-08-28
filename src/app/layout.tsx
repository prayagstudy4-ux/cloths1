import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "Clothing Business Manager",
  description:
    "Complete business management system for clothing brands — inventory, sales, purchases, payments, production, accounts and reports.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
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
