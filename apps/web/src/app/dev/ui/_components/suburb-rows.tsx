"use client"

// Card-row <div>s with ARIA table roles are the point of this component: the
// design system's data row (§4) and D52 both call for them over <table> markup.
// Restyling real table elements with CSS `display` is what drops table semantics
// in some browsers, so the roles are the more accessible choice here, not the less.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { type SuburbRow, formatAud } from "./fixtures"

// TanStack Table v9: features and row models are registered explicitly, and
// only what is registered exists. Sort functions are passed per column, which
// needs no `sortFns` registry and keeps unused built-ins out of the bundle.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
})

const helper = createColumnHelper<typeof features, SuburbRow>()

const columns = helper.columns([
  helper.accessor("rank", {
    header: "#",
    sortFn: sortFn_basic,
    cell: (info) => <span className="font-data text-value text-ink-dim">{info.getValue()}</span>,
  }),
  helper.accessor("name", {
    header: "Suburb",
    sortFn: sortFn_alphanumeric,
    cell: (info) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-card-title text-ink">{info.getValue()}</span>
        <span className="font-data text-micro-lg text-ink-dim uppercase">
          {info.row.original.state} {info.row.original.postcode}
        </span>
      </span>
    ),
  }),
  helper.accessor("medianPrice", {
    header: "Median",
    sortFn: sortFn_basic,
    cell: (info) => formatAud(info.getValue()),
  }),
  helper.accessor("grossYield", {
    header: "Yield",
    sortFn: sortFn_basic,
    cell: (info) => `${info.getValue().toFixed(1)}%`,
  }),
  helper.accessor("score", {
    header: "Score",
    sortFn: sortFn_basic,
    cell: (info) => <span className="font-semibold text-ink">{info.getValue()}</span>,
  }),
])

// One template shared by header and rows so the columns line up.
const GRID = "grid grid-cols-[2.25rem_minmax(0,1fr)_6.5rem_4rem_3.5rem] items-center gap-3"
const NUMERIC = new Set(["rank", "medianPrice", "grossYield", "score"])

type SuburbRowsProps = { rows: SuburbRow[] }

/**
 * TanStack Table as a headless engine under design-system.md §4 "Data row"
 * markup: a grid of card rows, not a <table>. ARIA table roles keep it a table
 * to assistive tech. Rows are clickable and open the detail drawer.
 */
export function SuburbRows({ rows }: SuburbRowsProps) {
  const [selected, setSelected] = React.useState<SuburbRow | null>(null)

  const table = useTable({
    features,
    columns,
    data: rows,
    initialState: { sorting: [{ id: "score", desc: true }] },
    enableSortingRemoval: false,
  })

  return (
    <>
      <div role="table" aria-label="Shortlisted suburbs" className="flex flex-col gap-1.75">
        <div role="rowgroup">
          {table.getHeaderGroups().map((group) => (
            <div key={group.id} role="row" className={cn(GRID, "px-3.5 pb-1")}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <div
                    key={header.id}
                    role="columnheader"
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                    }
                    className={cn(NUMERIC.has(header.column.id) && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 font-data text-micro-lg text-ink-dim uppercase transition-colors duration-170 hover:text-ink"
                    >
                      <table.FlexRender header={header} />
                      {sorted === "asc" ? <ArrowUpIcon className="size-3" /> : null}
                      {sorted === "desc" ? <ArrowDownIcon className="size-3" /> : null}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div role="rowgroup" className="flex flex-col gap-1.75">
          {table.getRowModel().rows.map((row) => (
            <div
              key={row.id}
              role="row"
              tabIndex={0}
              aria-label={`Open ${row.original.name}`}
              onClick={() => setSelected(row.original)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setSelected(row.original)
                }
              }}
              className={cn(
                GRID,
                "cursor-pointer rounded-lg border border-border-card bg-surface px-3.5 py-2.75",
                "transition-[background-color,border-color,box-shadow,transform] duration-170 ease-out",
                // §4 hover: tint #F8FAFD, teal border, 1px lift, teal-tinted shadow.
                "hover:-translate-y-px hover:border-accent-teal hover:bg-[#f8fafd] hover:shadow-[0_10px_22px_-18px_rgb(14_165_160/0.7)]",
                "focus-visible:border-accent-teal focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              )}
            >
              {row.getAllCells().map((cell) => (
                <div
                  key={cell.id}
                  role="cell"
                  className={cn(
                    NUMERIC.has(cell.column.id) &&
                      "text-right font-data text-value font-medium text-ink-3",
                  )}
                >
                  <table.FlexRender cell={cell} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-125">
          {selected ? (
            <>
              <SheetHeader>
                <p className="font-data text-micro-lg text-ink-dim uppercase">
                  Rank {selected.rank} · {selected.state} {selected.postcode}
                </p>
                <SheetTitle className="text-section">{selected.name}</SheetTitle>
                <SheetDescription>Fixture data. None of these figures are real.</SheetDescription>
              </SheetHeader>
              <dl className="grid grid-cols-3 gap-2.5 px-4">
                {[
                  ["Median", formatAud(selected.medianPrice)],
                  ["Yield", `${selected.grossYield.toFixed(1)}%`],
                  ["Score", String(selected.score)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-border-card bg-surface-sunk p-3"
                  >
                    <dt className="font-data text-micro-lg text-ink-dim uppercase">{label}</dt>
                    <dd className="mt-1 font-data text-metric-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
