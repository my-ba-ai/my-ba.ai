import { type ReactNode, ViewTransition } from "react"

interface Props {
  children: ReactNode
}

const DIRECTIONAL = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }

/**
 * Wraps a page's content so a typed navigation slides it (D71): forward slides
 * left, back slides right. Goes in each `page.tsx`, not a layout — layouts
 * persist across navigations, so enter/exit never fire there. Untyped
 * navigations don't animate (`default: "none"`).
 */
export function PageTransition({ children }: Readonly<Props>) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div>{children}</div>
    </ViewTransition>
  )
}
