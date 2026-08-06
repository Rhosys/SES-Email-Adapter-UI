/**
 * Wraps raw email HTML with responsive CSS and security overrides for
 * rendering inside a sandboxed iframe. Forces overflow containment without
 * destroying sender-defined layout (e.g. centered container tables).
 */
export function wrapEmailHtml(rawHtml: string): string {
  const markup = `<base target="_blank"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html, body { overflow-x: hidden !important; }
    * { max-width: 100% !important; box-sizing: border-box !important; }
    img, video, svg { height: auto !important; }
    table { max-width: 100% !important; overflow-x: auto !important; }
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
