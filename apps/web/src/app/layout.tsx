import type { Metadata } from "next"
import { APP_NAME } from "@my-ba/shared"
import "./globals.css"

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Investment property suburb selection and agent outreach, automated.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  )
}
