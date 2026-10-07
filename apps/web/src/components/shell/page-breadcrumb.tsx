"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import type { Crumb } from "@/lib/breadcrumbs"
import { NAV_BACK } from "@/lib/view-transitions"
import Link from "next/link"
import { Fragment } from "react"

interface Props {
  items: readonly Crumb[]
}

/**
 * Renders a `breadcrumbs.*` trail with the vendored shadcn Breadcrumb (Base UI).
 * A client component because `BreadcrumbLink` renders through Base UI's
 * `useRender`; the trail itself is plain serialisable data.
 */
export function PageBreadcrumb({ items }: Readonly<Props>) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 text-body-sm text-ink-muted sm:gap-1">
        {items.map((crumb, index) => (
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={`${index}:${crumb.label}`}>
            <BreadcrumbItem className="min-w-0">
              {crumb.href ? (
                <BreadcrumbLink
                  render={<Link href={crumb.href} transitionTypes={NAV_BACK} />}
                  className="truncate hover:text-accent-deep"
                >
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate text-ink-3 font-medium">
                  {crumb.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {index < items.length - 1 ? <BreadcrumbSeparator /> : null}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
