import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Stockpile",
    template: "%s · Stockpile",
  },
  description:
    "Stockpile is an inventory operating system for multi-site distributors: stock accuracy, purchasing, warehousing, fulfillment and audit in one place.",
  openGraph: {
    title: "Stockpile",
    description:
      "Purchase order to shelf to shipment — the movement ledger, role permissions and audit trail that make the numbers defensible. A public, writable demo that resets daily.",
    url: SITE_URL,
    siteName: "Stockpile",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stockpile",
    description:
      "Purchase order to shelf to shipment — the movement ledger, role permissions and audit trail that make the numbers defensible.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
