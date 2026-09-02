import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian Capital — Portfolio Watchlist",
  description: "Vercel SA take-home demo app",
};

// Matches the mobile browser chrome (address bar, status bar) to the
// app's own dark background — without this, a phone in dark mode still
// shows a jarring white/default-colored bar above the app.
export const viewport: Viewport = {
  themeColor: "#0b0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
