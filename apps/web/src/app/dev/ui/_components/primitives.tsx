"use client"

import { SearchXIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const STATES = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-start">
      <p className="pt-2 font-data text-micro-lg text-ink-dim uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/**
 * Every vendored primitive rendered once on the real tokens, stock variants
 * only. This is the regression surface: if a token remap in globals.css goes
 * wrong, it shows up here first.
 */
export function Primitives() {
  return (
    <div className="flex flex-col gap-5">
      <Row label="Button">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Exclude</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Separator />
      <Row label="Input">
        <Input className="max-w-xs" placeholder="Suburb or postcode" />
        <Input className="max-w-xs" aria-invalid defaultValue="99999" />
        <Input className="max-w-xs" disabled placeholder="Disabled" />
      </Row>
      <Row label="Textarea">
        <Textarea className="max-w-md" placeholder="Notes for the agent" />
      </Row>
      <Row label="Select">
        <Select items={STATES} defaultValue="NSW">
          <SelectTrigger className="w-56" aria-label="State">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATES.map((state) => (
              <SelectItem key={state.value} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Separator />
      <Row label="Checkbox">
        <div className="flex items-center gap-2">
          <Checkbox id="p-check" defaultChecked />
          <Label htmlFor="p-check">Exclude flood-prone SA2s</Label>
        </div>
      </Row>
      <Row label="Radio group">
        <RadioGroup defaultValue="balanced" className="flex gap-4" aria-label="Strategy">
          {["growth", "yield", "balanced"].map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`p-radio-${value}`} value={value} />
              <Label htmlFor={`p-radio-${value}`} className="capitalize">
                {value}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Row>
      <Row label="Switch">
        <div className="flex items-center gap-2">
          <Switch id="p-switch" defaultChecked />
          <Label htmlFor="p-switch">Email me at each gate</Label>
        </div>
      </Row>
      <Separator />
      <Row label="Tabs">
        <Tabs defaultValue="trend" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>
          <TabsContent value="trend" className="text-body-sm text-ink-muted">
            Trend analysis output renders here.
          </TabsContent>
          <TabsContent value="growth" className="text-body-sm text-ink-muted">
            Growth potential output renders here.
          </TabsContent>
          <TabsContent value="agents" className="text-body-sm text-ink-muted">
            Agent discovery output renders here.
          </TabsContent>
        </Tabs>
      </Row>
      <Row label="Tooltip">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>Hover or focus</TooltipTrigger>
          <TooltipContent>Composite of six weighted criteria.</TooltipContent>
        </Tooltip>
      </Row>
      <Row label="Popover">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Run cost</PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>HtAG spend this run</PopoverTitle>
              <PopoverDescription className="font-data text-value">
                $4.20 of $20.00
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </Row>
      <Separator />
      <Row label="Badge">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Excluded</Badge>
      </Row>
      <Row label="Skeleton">
        <div className="flex w-full max-w-md flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Row>
      <Separator />
      <Row label="Sheet">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle>Suburb detail</SheetTitle>
              <SheetDescription>Side panel. §4 drawers are 500px on desktop.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Row>
      <Row label="Drawer">
        <Drawer>
          <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Bottom drawer</DrawerTitle>
              <DrawerDescription>Swipe down or press Escape to close.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </Row>
      <Row label="Toast">
        <Button
          variant="outline"
          onClick={() => toast("Shortlist saved", { description: "8 suburbs kept." })}
        >
          Neutral
        </Button>
        <Button variant="outline" onClick={() => toast.success("Gate approved")}>
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error("trend_analyser failed", { description: "Nothing was written." })
          }
        >
          Error
        </Button>
      </Row>
      <Separator />
      <Row label="Empty">
        <Empty className="border border-border-card bg-surface-sunk">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No suburbs matched</EmptyTitle>
            <EmptyDescription>
              The $650,000 budget ceiling is the binding constraint. Fixture copy, showing the §4
              pattern.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Row>
    </div>
  )
}
