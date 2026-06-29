import type { Metadata } from "next";
import Link from "next/link";
import NavLinks from "./components/nav-links";
import "./globals.css";

export const metadata: Metadata = {
  title: "MLI Billing",
  description: "Calendar → QuickBooks invoicing for Music Lee Inclined",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/" className="nav-brand">
            <span className="mark">♩</span>
            MLI Billing
          </Link>
          <NavLinks />
          {process.env.ADMIN_PASSWORD && (
            <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
              <button
                type="submit"
                className="ghost sm"
                style={{ color: "var(--sub)", boxShadow: "none", border: "none", background: "none" }}
              >
                Sign out
              </button>
            </form>
          )}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
