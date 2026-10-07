import { Button } from "@/components/ui/button"
import { NAV_FORWARD } from "@/lib/view-transitions"
import { Plus } from "lucide-react"
import Link from "next/link"

/** The page's primary action: start a new purchase task (P1-3). */
export function NewTaskButton() {
  return (
    <Button
      variant="gradient"
      render={<Link href="/tasks/new" transitionTypes={NAV_FORWARD} />}
      nativeButton={false}
      className="h-auto rounded-md px-5 py-2.75"
    >
      <Plus aria-hidden />
      New Purchase Task
    </Button>
  )
}
