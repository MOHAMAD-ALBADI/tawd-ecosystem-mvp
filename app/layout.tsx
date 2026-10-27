import { asset } from "@/lib/asset";
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-sans-arabic/300.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "طود | TAWD — منظومة العيادة الذكية",
  description: "TAWD connects clinic growth, operations and continuous care through one intelligent orchestration layer. Demonstration build with synthetic data.",
  icons: { icon: asset("/brand/tawd-mark-white.png") },
};

export const viewport: Viewport = { themeColor: "#0a0a0a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-tx antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
