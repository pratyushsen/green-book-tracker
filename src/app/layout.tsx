import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Green Book Tracker", template: "%s · Green Book Tracker" },
  description: "Study tracker for working through The Green Book and preparing for quant finance interviews.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e1110",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster theme="dark" position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
