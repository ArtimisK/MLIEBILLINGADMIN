/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` produces a self-contained server for the Contabo VPS.
  // It's opt-in (BUILD_STANDALONE=1) because the trace step creates symlinks,
  // which need elevated privileges on Windows dev machines. Enable it on the
  // Linux VPS / CI where symlinks are unrestricted; Vercel ignores it.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // The engine imports `postgres`/`googleapis` etc. on the server only.
  serverExternalPackages: ["postgres", "googleapis", "intuit-oauth"],
};

export default nextConfig;
