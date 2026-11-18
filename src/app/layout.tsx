import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaSDash — SaaS metrics for early-stage founders",
  description: "Investor-grade MRR, retention and runway metrics from Stripe or a CSV.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
