"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks() {
  const path = usePathname();
  if (path === "/login") return null;

  const active = (href: string) =>
    path === href || (href !== "/" && path.startsWith(href))
      ? "nav-link active"
      : "nav-link";

  return (
    <div className="nav-links">
      <Link href="/"        className={active("/")}>Dashboard</Link>
      <Link href="/upload"  className={active("/upload")}>Upload</Link>
      <Link href="/preview" className={active("/preview")}>Invoices</Link>
      <Link href="/settings" className={active("/settings")}>Settings</Link>
    </div>
  );
}
