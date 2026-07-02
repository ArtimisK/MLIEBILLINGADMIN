"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import NavLinks from "./nav-links";
import SignOutButton from "./sign-out-button";

export default function PageShell({
  children,
  hasPassword,
}: {
  children: React.ReactNode;
  hasPassword: boolean;
}) {
  const isLogin = usePathname() === "/login";

  if (isLogin) {
    return <div className="login-shell">{children}</div>;
  }

  return (
    <>
      <nav>
        <Link href="/" className="nav-brand">
          <span className="mark">♩</span>
          MLI Billing
        </Link>
        <NavLinks />
        {hasPassword && <SignOutButton />}
      </nav>
      <main>{children}</main>
    </>
  );
}