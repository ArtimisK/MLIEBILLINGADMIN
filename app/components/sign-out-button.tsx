"use client";
import { usePathname } from "next/navigation";

export default function SignOutButton() {
  const path = usePathname();
  if (path === "/login") return null;

  return (
    <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
      <button
        type="submit"
        className="ghost sm"
        style={{ color: "var(--sub)", boxShadow: "none", border: "none", background: "none" }}
      >
        Sign out
      </button>
    </form>
  );
}
