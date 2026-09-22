import { redirect } from "next/navigation"

/** The task list is home. `proxy.ts` has already sent anyone without a session to /sign-in. */
export default function RootPage() {
  redirect("/tasks")
}
