import type { MetadataRoute } from "next";

// Block every crawler — this is an internal admin tool, never index it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
      // Explicitly block known AI scrapers
      { userAgent: "GPTBot",         disallow: "/" },
      { userAgent: "ChatGPT-User",   disallow: "/" },
      { userAgent: "Claude-Web",     disallow: "/" },
      { userAgent: "anthropic-ai",   disallow: "/" },
      { userAgent: "CCBot",          disallow: "/" },
      { userAgent: "Googlebot",      disallow: "/" },
      { userAgent: "Bingbot",        disallow: "/" },
      { userAgent: "AhrefsBot",      disallow: "/" },
      { userAgent: "SemrushBot",     disallow: "/" },
    ],
  };
}
