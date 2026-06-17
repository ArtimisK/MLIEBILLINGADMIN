import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MLIE Invoicing",
  description: "Calendar → QuickBooks invoicing",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/preview">Preview</Link>
          <Link href="/review">Review queue</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
