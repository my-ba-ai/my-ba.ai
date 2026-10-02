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
