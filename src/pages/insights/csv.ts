const esc = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v)
  // neutralise spreadsheet formula injection and quote anything with separators
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const toCsv = (rows: (string | number | undefined)[][]) => rows.map((r) => r.map(esc).join(',')).join('\r\n')

/** Real client-side CSV download (UTF-8 with BOM so Excel opens it correctly). */
export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
