/**
 * Timestamps render in Sydney time with an explicit zone, not the server's
 * local zone. Server components format these, and a server in UTC would
 * otherwise show a different day to the one the user lived through.
 */
const dateTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
})

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}
