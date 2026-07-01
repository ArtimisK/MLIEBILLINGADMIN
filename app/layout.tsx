import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import NavLinks from "./components/nav-links";
import SignOutButton from "./components/sign-out-button";
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
        <nav>
          <Link href="/" className="nav-brand">
            <span className="mark">♩</span>
            MLI Billing
          </Link>
          <NavLinks />
          {process.env.ADMIN_PASSWORD && <SignOutButton />}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
