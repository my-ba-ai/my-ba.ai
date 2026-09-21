import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * Everything under /dev is a development tool. It 404s in production builds so
 * the gallery never ships as a reachable page. The code is still compiled, so
 * `pnpm typecheck` and `next build` keep catching regressions in it.
 */
export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  )
}
