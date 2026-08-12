/**
 * Wraps raw email HTML with responsive CSS and security overrides for
 * rendering inside a sandboxed iframe. Forces overflow containment without
 * destroying sender-defined layout (e.g. centered container tables).
 */
// table { width: auto !important } shrinks nested "container" tables (the
// standard HTML-email pattern — explicit pixel widths inside a <center>
// wrapper) to their content instead of their specified width, which is what
// stops a wide table from forcing the viewport to overflow on mobile.
//
// The trap: centering those same tables via their own `margin: 0 auto` only
// works when a box has a *definite* width — CSS resolves auto margins to 0
// (not centered) when width is also auto, per the spec's block-level layout
// algorithm. That's true consistently across engines. What differs between
// engines is whether the alternative, `max-width: 100%` with the table's
// specified width left intact, actually stays capped once nested several
// tables deep inside a <center>: it does in Chromium, but WebKit was
// observed still overflowing (the specified width apparently wins over
// max-width somewhere in its fixed/auto table-layout resolution for this
// structure) — so max-width can't be relied on as the sole containment
// mechanism here.
//
// The fix: keep shrinking tables with width: auto, but center them with
// flexbox instead of margin: auto. Flex alignment computes free space and
// distributes it regardless of whether the child's own width resolved as
// auto or definite, so it doesn't hit the auto-margin quirk and doesn't
// depend on any single engine's table sizing edge cases.
//
// align-self on just the direct table/center children (not align-items on
// body itself) so this only touches the elements we forced to width: auto.
// body keeps its default stretch behavior for everything else — a
// non-table wrapper (e.g. a full-bleed <div> banner) still fills the width
// it always would have, instead of every top-level child shrink-wrapping
// to its content.
//
// min-width: 0 matters just as much as max-width: 100% here: email-builder
// frameworks (Foundation for Emails and its many derivatives) commonly wrap
// the whole message in <center style="min-width:640px">, and min-width wins
// over max-width when the two conflict, so without this reset that wrapper
// forces horizontal overflow on any viewport narrower than the sender's
// desktop layout.
export function wrapEmailHtml(rawHtml: string): string {
  const markup = `<base target="_blank"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html, body { overflow-x: hidden !important; }
    body { display: flex !important; flex-direction: column !important; margin: 0 !important; padding: 1rem !important; }
    body > table, body > center { align-self: center !important; }
    * { max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
    img, video, svg { height: auto !important; }
    table { width: auto !important; max-width: 100% !important; }
    body, p, span, div, td, th, a, li {
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
    }
    pre { white-space: pre-wrap !important; }
  </style>`

  const headMatch = /<head[^>]*>/i.exec(rawHtml)
  if (headMatch) {
    const idx = headMatch.index + headMatch[0].length
    return rawHtml.slice(0, idx) + markup + rawHtml.slice(idx)
  }
  const htmlMatch = /<html[^>]*>/i.exec(rawHtml)
  if (htmlMatch) {
    const idx = htmlMatch.index + htmlMatch[0].length
    return rawHtml.slice(0, idx) + `<head>${markup}</head>` + rawHtml.slice(idx)
  }
  return `<!doctype html><html><head>${markup}</head><body>${rawHtml}</body></html>`
}
