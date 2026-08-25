/**
 * Strips attachment/inline-file bodies out of a raw .eml source so the
 * "View original email" modal doesn't have to render megabytes of base64
 * attachment data inline. Headers for each part are left intact — only the
 * base64 body is replaced with a placeholder — so the MIME structure is
 * still visible, just without the payload.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function stripAttachmentsFromRawEmail(raw: string): string {
  const boundaries = new Set<string>()
  const boundaryRegex = /boundary\s*=\s*"?([^";\r\n]+)"?/gi
  let boundaryMatch: RegExpExecArray | null
  while ((boundaryMatch = boundaryRegex.exec(raw))) {
    boundaries.add(boundaryMatch[1])
  }
  if (boundaries.size === 0) return raw // not multipart — nothing to strip

  const boundaryLineRegex = new RegExp(
    `^--(${[...boundaries].map(escapeRegExp).join('|')})(--)?\\s*$`,
  )

  const lines = raw.split(/\r\n|\n/)
  const output: string[] = []
  let i = 0

  // Preamble / top-level headers before the first boundary — unchanged
  while (i < lines.length && !boundaryLineRegex.test(lines[i])) {
    output.push(lines[i])
    i++
  }

  while (i < lines.length) {
    const boundaryLine = lines[i]
    output.push(boundaryLine)
    i++
    if (/--\s*$/.test(boundaryLine)) break // closing boundary — no part follows

    const headerLines: string[] = []
    while (i < lines.length && lines[i] !== '' && !boundaryLineRegex.test(lines[i])) {
      headerLines.push(lines[i])
      output.push(lines[i])
      i++
    }
    if (i < lines.length && lines[i] === '') {
      output.push(lines[i])
      i++
    }

    const bodyStart = i
    while (i < lines.length && !boundaryLineRegex.test(lines[i])) {
      i++
    }
    const bodyLines = lines.slice(bodyStart, i)

    const headerText = headerLines.join('\n')
    const isFilePart =
      /Content-Disposition:\s*attachment/i.test(headerText) ||
      /Content-Disposition:[^\r\n]*\bfilename\*?=/i.test(headerText) ||
      /Content-Type:[^\r\n]*\bname\s*=/i.test(headerText)

    if (isFilePart && bodyLines.some(line => line.trim() !== '')) {
      const filenameMatch =
        headerText.match(/filename\*?=\s*"?([^";\r\n]+)"?/i) ?? headerText.match(/name\s*=\s*"?([^";\r\n]+)"?/i)
      const filename = filenameMatch ? filenameMatch[1] : null
      const approxBytes = Math.floor(bodyLines.join('').length * 0.75) // base64 -> raw bytes estimate
      output.push(`[attachment content omitted${filename ? `: ${filename}` : ''} (~${formatBytes(approxBytes)})]`)
      output.push('')
    } else {
      output.push(...bodyLines)
    }
  }

  return output.join('\r\n')
}
