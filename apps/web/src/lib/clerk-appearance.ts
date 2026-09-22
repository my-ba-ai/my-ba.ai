import type { SignIn } from "@clerk/nextjs"
import type { ComponentProps } from "react"

type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>

/**
 * Clerk's theme, mapped from design-system.md §1. Literal hex values because
 * Clerk derives hover and alpha shades from the colours it is given, which
 * needs a colour it can parse and not a `var()` reference. Each one is the
 * token named beside it; if a token changes, change it here too.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#0ea5a0", // --accent
    colorPrimaryForeground: "#ffffff",
    colorForeground: "#101b2d", // --ink
    colorMutedForeground: "#5b6b82", // --ink-muted
    colorBackground: "#ffffff", // --surface
    colorInput: "#ffffff", // --surface
    colorInputForeground: "#101b2d", // --ink
    colorBorder: "#d5deea", // --border-strong
    colorDanger: "#c42b2b", // --neg
    colorSuccess: "#15803d", // --pos
    colorRing: "#0ea5a0", // --accent
    fontFamily: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "10px", // buttons, §3
  },
  elements: {
    // The split layout already frames the form, so drop Clerk's own card chrome.
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "shadow-none border-0 bg-transparent p-0",
  },
}
