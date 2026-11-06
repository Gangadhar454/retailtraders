import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";

import { AuthProvider } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NetPnL — India's Retail Trader Community & Daily P&L",
    template: "%s · NetPnL",
  },
  description:
    "Did retail traders gain or lose today? A community space where Indian retail traders gather, share their daily trading P&L, and see how retail India traded today.",
  keywords: [
    "retail traders",
    "trading community",
    "India",
    "daily P&L",
    "retail sentiment",
    "trader leaderboard",
    "Upstox",
    "Zerodha",
    "Angel One",
  ],
  openGraph: {
    title: "NetPnL — India's Retail Trader Community & Daily P&L",
    description:
      "A community space where Indian retail traders gather and share their daily P&L. See whether retail traders gained or lost money today.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NetPnL — Did retail traders gain or lose today?",
    description:
      "A community space where Indian retail traders gather, share their daily trading P&L, and track overall retail market sentiment.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var saved = localStorage.getItem('netpnl_theme');
    var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
