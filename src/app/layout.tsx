import type { Metadata } from "next";
import { TRPCProvider } from "@/features/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaunClip",
  description: "Local-first AI video clipping tool"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
