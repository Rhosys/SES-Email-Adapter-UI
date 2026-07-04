// TEMP: A/B testing harness for the mobile "email content wider than iframe"
// overflow problem. Pick a winner, inline its `wrap` fn where the iframe
// srcdoc is built (see EmailSignalCard.vue), then delete this file and the
// mode-picker UI.
//
// The iframe sandbox has no allow-same-origin, so there is no way to reach
// into the email document with CSS from the parent page — the only lever we
// have is the srcdoc string itself. Each mode below wraps the raw email HTML
// with an injected <style>/<meta viewport> block before it's handed to the
// iframe.

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">'

// Emails are rarely valid documents, so all three shapes show up in practice:
// a real <head>, a bare <html> wrapper, or just a soup of tags with neither.
function injectIntoHtml(rawHtml: string, markup: string): string {
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

// "Design width" the auto-scale modes shrink down to fit the real viewport —
// most fixed-width marketing/hybrid emails are built around 600-650px. There's
// no way to measure the email's *actual* rendered width from here (sandbox has
// no allow-same-origin), so content wider than this assumption still overflows
// proportionally — verified against a 900px test table, where zoom-fit/
// transform-fit left the content partially cut off but wrap-shrink/
// fluid-tables (true reflow, width-independent) did not.
const ASSUMED_EMAIL_WIDTH = 640

export interface EmailPreviewMode {
  id: string
  label: string
  wrap: (rawHtml: string) => string
}

export const EMAIL_PREVIEW_MODES: EmailPreviewMode[] = [
  {
    id: 'baseline',
    label: 'Current',
    wrap: (html) => html,
  },
  {
    id: 'wrap-shrink',
    label: 'Wrap text',
    wrap: (html) => injectIntoHtml(html, `${VIEWPORT_META}<style>
      html, body { overflow-x: hidden !important; }
      * { max-width: 100% !important; box-sizing: border-box !important; }
      img, video, svg { height: auto !important; }
      table { width: auto !important; }
      body, p, span, div, td, th, a, li {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
      }
      pre { white-space: pre-wrap !important; }
    </style>`),
  },
  {
    id: 'fluid-tables',
    label: 'Stack tables',
    wrap: (html) => injectIntoHtml(html, `${VIEWPORT_META}<style>
      html, body { overflow-x: hidden !important; }
      * { max-width: 100% !important; box-sizing: border-box !important; }
      img, video, svg { height: auto !important; }
      body, p, span, div, td, th, a, li {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
      }
      table, tbody, tr, td, th { display: block !important; width: 100% !important; }
    </style>`),
  },
  {
    id: 'zoom-fit',
    label: 'Auto-scale (zoom)',
    wrap: (html) => injectIntoHtml(html, `${VIEWPORT_META}<style>
      html { container-type: inline-size; overflow-x: hidden !important; }
      body {
        margin: 0;
        width: ${ASSUMED_EMAIL_WIDTH}px;
        /* dividing by "Npx" (not bare N) keeps this a unitless ratio — zoom
           rejects a length and silently falls back to 1 otherwise */
        zoom: calc(100cqi / ${ASSUMED_EMAIL_WIDTH}px);
      }
      img, video, svg { max-width: 100%; height: auto !important; }
    </style>`),
  },
  {
    id: 'transform-fit',
    label: 'Auto-scale (transform)',
    wrap: (html) => injectIntoHtml(html, `${VIEWPORT_META}<style>
      html { container-type: inline-size; overflow-x: hidden !important; }
      body {
        margin: 0;
        width: ${ASSUMED_EMAIL_WIDTH}px;
        transform: scale(calc(100cqi / ${ASSUMED_EMAIL_WIDTH}px));
        transform-origin: top left;
      }
      img, video, svg { max-width: 100%; height: auto !important; }
    </style>`),
  },
]

export function getEmailPreviewMode(id: string): EmailPreviewMode {
  return EMAIL_PREVIEW_MODES.find((m) => m.id === id) ?? EMAIL_PREVIEW_MODES[0]
}
