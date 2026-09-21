import { ClerkProvider } from "@clerk/nextjs"
import { APP_NAME } from "@my-ba/shared"
import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"

// design-system.md §2 (D55). One family for everything. Manrope is variable on
// Google Fonts, so `weight` is omitted deliberately - the axis covers the
// 400/500/600 the design system uses.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Investment property suburb selection and agent outreach, automated.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={manrope.variable}>
      <body className="min-h-dvh">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
