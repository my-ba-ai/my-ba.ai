import type { HtagCallRecord, HtagCallRecorder } from "@my-ba/shared"

/** Test double for the spend ledger (D63). Keeps every record in call order. */
export class InMemoryHtagCallRecorder implements HtagCallRecorder {
  readonly calls: HtagCallRecord[] = []

  async record(call: HtagCallRecord): Promise<void> {
    this.calls.push(call)
  }
}
