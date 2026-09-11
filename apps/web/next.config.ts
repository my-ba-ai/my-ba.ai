import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace package is compiled to CJS; transpiling keeps it consistent
  // across server components, client components and the edge runtime.
  transpilePackages: ["@my-ba/shared"],
  typedRoutes: true,
}

export default nextConfig
