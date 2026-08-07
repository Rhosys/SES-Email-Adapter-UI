/**
 * Wraps raw email HTML with responsive CSS and security overrides for
 * rendering inside a sandboxed iframe. Forces overflow containment without
 * destroying sender-defined layout (e.g. centered container tables).
 */
// table-layout: fixed stops a deeply nested table's explicit pixel width from
// inflating every ancestor table to match (browsers grow an auto-layout table
// to fit its widest un-shrinkable descendant, which overflows narrow
// viewports even under max-width: 100%). Plain width: auto stops that too,
// but it also breaks sender-centered tables (width: 640px; margin: 0 auto) on
// wide screens, because auto margins resolve to 0 — not centered — when width
// is also auto.
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
    * { max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
    img, video, svg { height: auto !important; }
    table { max-width: 100% !important; table-layout: fixed !important; overflow-x: auto !important; }
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
