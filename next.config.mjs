/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  serverExternalPackages: ["postgres", "googleapis", "intuit-oauth"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Never index this internal tool
          { key: "X-Robots-Tag",        value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
          // Clickjacking protection
          { key: "X-Frame-Options",     value: "DENY" },
          // Prevent MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't send referrer to external sites
          { key: "Referrer-Policy",     value: "no-referrer" },
          // Disable browser features this app doesn't need
          { key: "Permissions-Policy",  value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Force HTTPS for 1 year
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
