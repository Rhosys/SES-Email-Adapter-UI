// Resource dates (e.g. Resource.expectedResolutionDate) may arrive as a bare
// calendar date ("2026-08-26") or a full ISO datetime with a time-of-day
// and/or a UTC offset ("2026-08-26T17:00+00:00") — usually only one of the
// two is present, never assume which. Parse whatever's actually there
// instead of truncating to a bare date, which would silently discard real
// time-of-day/offset information and can shift the effective calendar day
// across a timezone boundary.
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseResourceDate(dateStr: string): Date {
  // A bare date is parsed as UTC midnight per the ES spec — append a local
  // time so it anchors to local midnight instead, matching what a calendar
  // date with no time-of-day actually means to the viewer.
  return BARE_DATE.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr)
}

// Local calendar-day key (YYYY-MM-DD) for today/tomorrow/this-week bucketing,
// so a date with a time+offset lands on the viewer's actual local day rather
// than whatever day the raw string's prefix happened to say.
export function dayKey(input: string | Date): string {
  const date = typeof input === 'string' ? parseResourceDate(input) : input
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// A bare date is only "past" once its whole calendar day has elapsed; a
// datetime with real time-of-day is past as soon as that moment passes.
export function isResourceDatePast(dateStr: string): boolean {
  if (BARE_DATE.test(dateStr)) return dayKey(dateStr) < dayKey(new Date())
  return parseResourceDate(dateStr).getTime() < Date.now()
}
