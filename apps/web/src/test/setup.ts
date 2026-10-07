/**
 * jsdom gaps that real browsers don't have.
 *
 * PointerEvent: jsdom doesn't implement it, and Base UI's Radio (and other
 * button-like primitives) dispatch a synthetic click through
 * `new window.PointerEvent(...)`. Without this, clicking a radio in a test
 * throws an uncaught `PointerEvent is not a constructor` and the value never
 * changes. MouseEvent carries every field those handlers read.
 */
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? "mouse"
      this.isPrimary = init.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

/**
 * CSS.escape: jsdom has no `CSS` global, and React's <ViewTransition> (D71)
 * calls `CSS.escape` while assigning `view-transition-name` during a
 * transition commit. Without it the commit throws, so a `startTransition`
 * state change (e.g. switching criteria-form steps) never lands in tests.
 * Minimal port of the CSSOM serialize-an-identifier algorithm.
 */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function") {
  const existing = (globalThis as { CSS?: Partial<typeof CSS> }).CSS ?? {}
  ;(globalThis as { CSS?: unknown }).CSS = {
    supports: () => false,
    ...existing,
    escape: (value: string): string => {
      const s = String(value)
      let out = ""
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i)
        const ch = s.charAt(i)
        if (code === 0) out += "�"
        else if (
          (code >= 0x1 && code <= 0x1f) ||
          code === 0x7f ||
          (i === 0 && code >= 0x30 && code <= 0x39) ||
          (i === 1 && code >= 0x30 && code <= 0x39 && s.charCodeAt(0) === 0x2d)
        )
          out += `\\${code.toString(16)} `
        else if (i === 0 && s.length === 1 && code === 0x2d) out += `\\${ch}`
        else if (
          code >= 0x80 ||
          code === 0x2d ||
          code === 0x5f ||
          (code >= 0x30 && code <= 0x39) ||
          (code >= 0x41 && code <= 0x5a) ||
          (code >= 0x61 && code <= 0x7a)
        )
          out += ch
        else out += `\\${ch}`
      }
      return out
    },
  }
}
