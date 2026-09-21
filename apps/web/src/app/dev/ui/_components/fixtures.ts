/**
 * Fixture data for the /dev/ui gallery. Suburb names and postcodes are real;
 * every metric is invented. Nothing here comes from HtAG, and nothing here
 * should be imported outside /dev.
 */

export const SUBURB_OPTIONS: string[] = [
  "Auburn",
  "Bankstown",
  "Blacktown",
  "Burwood",
  "Cabramatta",
  "Camden",
  "Campbelltown",
  "Castle Hill",
  "Cessnock",
  "Chatswood",
  "Cronulla",
  "Dee Why",
  "Engadine",
  "Fairfield",
  "Frenchs Forest",
  "Gosford",
  "Granville",
  "Hornsby",
  "Hurstville",
  "Kellyville",
  "Kiama",
  "Kogarah",
  "Leppington",
  "Liverpool",
  "Maitland",
  "Manly",
  "Marrickville",
  "Marsden Park",
  "Merrylands",
  "Miranda",
  "Mona Vale",
  "Mount Druitt",
  "Narellan",
  "Newcastle",
  "Newtown",
  "Oran Park",
  "Parramatta",
  "Penrith",
  "Rockdale",
  "Rouse Hill",
  "Ryde",
  "Schofields",
  "Shellharbour",
  "St Marys",
  "Strathfield",
  "Sutherland",
  "The Entrance",
  "Wetherill Park",
  "Wollongong",
  "Wyong",
]

export type SuburbRow = {
  id: string
  rank: number
  name: string
  state: "NSW"
  postcode: string
  medianPrice: number
  grossYield: number
  score: number
}

export const SUBURB_ROWS: SuburbRow[] = [
  {
    id: "maitland-2320",
    rank: 1,
    name: "Maitland",
    state: "NSW",
    postcode: "2320",
    medianPrice: 745_000,
    grossYield: 4.6,
    score: 82,
  },
  {
    id: "cessnock-2325",
    rank: 2,
    name: "Cessnock",
    state: "NSW",
    postcode: "2325",
    medianPrice: 610_000,
    grossYield: 5.1,
    score: 79,
  },
  {
    id: "penrith-2750",
    rank: 3,
    name: "Penrith",
    state: "NSW",
    postcode: "2750",
    medianPrice: 905_000,
    grossYield: 4.2,
    score: 76,
  },
  {
    id: "wyong-2259",
    rank: 4,
    name: "Wyong",
    state: "NSW",
    postcode: "2259",
    medianPrice: 780_000,
    grossYield: 4.4,
    score: 73,
  },
  {
    id: "shellharbour-2529",
    rank: 5,
    name: "Shellharbour",
    state: "NSW",
    postcode: "2529",
    medianPrice: 890_000,
    grossYield: 4.0,
    score: 70,
  },
  {
    id: "campbelltown-2560",
    rank: 6,
    name: "Campbelltown",
    state: "NSW",
    postcode: "2560",
    medianPrice: 860_000,
    grossYield: 4.3,
    score: 68,
  },
  {
    id: "blacktown-2148",
    rank: 7,
    name: "Blacktown",
    state: "NSW",
    postcode: "2148",
    medianPrice: 1_010_000,
    grossYield: 3.9,
    score: 64,
  },
  {
    id: "liverpool-2170",
    rank: 8,
    name: "Liverpool",
    state: "NSW",
    postcode: "2170",
    medianPrice: 1_050_000,
    grossYield: 3.8,
    score: 61,
  },
]

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})

export function formatAud(value: number): string {
  return aud.format(value)
}
