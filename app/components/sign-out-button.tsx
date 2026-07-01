"use client";
import { usePathname } from "next/navigation";

export default function SignOutButton() {
  const path = usePathname();
  if (path === "/login") return null;

  return (
    <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
      <button type="submit" className="nav-signout">
        Sign out
      </button>
    </form>
  );
}
