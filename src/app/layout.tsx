import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TRPCProvider } from "@/features/trpc/client";
import { BRAND_ASSETS, BRAND_IMAGE_SIZES } from "@/shared/constants/brand";
import "./globals.css";

const description = "Local-first AI video clipping tool for finding, editing, and rendering short-form clips.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "PaunClip",
  description,
  icons: {
    icon: BRAND_ASSETS.logoTransparent,
    shortcut: BRAND_ASSETS.logoTransparent,
    apple: BRAND_ASSETS.logoTransparent,
  },
  openGraph: {
    title: "PaunClip",
    description,
    images: [
      {
        url: BRAND_ASSETS.bannerDark,
        width: BRAND_IMAGE_SIZES.banner.width,
        height: BRAND_IMAGE_SIZES.banner.height,
        alt: "PaunClip",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PaunClip",
    description,
    images: [BRAND_ASSETS.bannerDark],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
