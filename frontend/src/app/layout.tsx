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
    default: "NetPnL — India's Retail Net P&L Today",
    template: "%s · NetPnL",
  },
  description:
    "Publish your daily profit and loss, get it verified against Upstox or Zerodha, and receive voluntary peer-to-peer UPI gifts from the retail community.",
  keywords: [
    "trading",
    "P&L",
    "Upstox",
    "Zerodha",
    "UPI",
    "retail traders",
    "India",
    "leaderboard",
  ],
  openGraph: {
    title: "NetPnL — India's Retail Net P&L Today",
    description:
      "A live counter of India's retail traders' daily profit and loss. Verified where it matters.",
    type: "website",
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
