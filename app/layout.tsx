import type { Metadata } from "next";
import { Inter } from "next/font/google";
import PageShell from "./components/page-shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MLI Billing",
  description: "Calendar → QuickBooks invoicing for Music Lee Inclined",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <PageShell hasPassword={!!process.env.ADMIN_PASSWORD}>
          {children}
        </PageShell>
      </body>
    </html>
  );
}