import { z } from "zod"

/** Australian states and territories. Eight of them, and that will not change. */
export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const
export const auStateSchema = z.enum(AU_STATES)
export type AuState = z.infer<typeof auStateSchema>
