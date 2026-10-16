/* HTML email helpers: a responsive starter layout and a compatibility checker. */

/** Table-based, 600px, inline-styled layout with a mobile media query: the safest pattern for Gmail, Outlook and Apple Mail. */
export const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{journal_name}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 16px !important; padding-right: 16px !important; }
      .btn a { display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;">
          <tr>
            <td class="px" style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#0f172a;">
              {journal_name}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#334155;">
              <p style="margin:0 0 16px;">Dear {author_name},</p>
              <p style="margin:0 0 16px;">This is an update about your paper <strong>{paper_id}</strong>. The payable amount is <strong>{payment_amount}</strong>.</p>
              <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                <tr>
                  <td style="border-radius:6px;background-color:#4f46e5;">
                    <a href="{payment_link}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">View details</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;">With regards,<br>Editorial Office, {journal_name}</p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:16px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
              Questions? Write to {support_email}. You received this email because of your submission {paper_id}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

export interface HtmlCheck { id: string; level: 'pass' | 'warn' | 'fail'; label: string; detail?: string }

/** Heuristic checks for responsive layout and compatibility with major email clients. */
export function lintEmailHtml(html: string): HtmlCheck[] {
  const h = html
  const lower = h.toLowerCase()
  const out: HtmlCheck[] = []
  const add = (id: string, ok: boolean, level: 'warn' | 'fail', pass: string, fail: string, detail?: string) =>
    out.push({ id, level: ok ? 'pass' : level, label: ok ? pass : fail, detail: ok ? undefined : detail })

  add('script', !/<script[\s>]/.test(lower), 'fail', 'No scripts', 'Contains <script>', 'Email clients remove scripts. Delete them.')
  add('viewport', /<meta[^>]+name=["']viewport["']/.test(lower), 'warn', 'Viewport meta tag present', 'Missing viewport meta tag', 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so phones scale the email.')
  add('media', /@media[^{]*max-width/.test(lower), 'warn', 'Mobile media query present', 'No mobile media query', 'Add an @media (max-width: 620px) rule so the layout adapts on small screens.')
  add('table', /<table[\s>]/.test(lower), 'warn', 'Table-based layout', 'No table layout', 'Outlook ignores most modern layout. Build the structure with <table role="presentation">.')
  const maxW = [...lower.matchAll(/max-width\s*:\s*(\d+)px/g)].map((m) => Number(m[1])).concat([...lower.matchAll(/width=["'](\d+)["']/g)].map((m) => Number(m[1])))
  add('width', maxW.some((w) => w >= 320 && w <= 700), 'warn', 'Content width 600px or less', 'No fixed content width of 320–700px', 'Use a 600px wide container with max-width:600px.')
  const modern = /(display\s*:\s*(flex|grid)|position\s*:\s*(absolute|fixed)|float\s*:)/.test(lower)
  add('modern', !modern, 'warn', 'No flex, grid or absolute positioning', 'Uses flex, grid, float or absolute positioning', 'Outlook and some webmail clients do not support these. Use tables.')
  const imgs = [...lower.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  add('alt', imgs.every((i) => /\balt=/.test(i)), 'warn', imgs.length ? 'All images have alt text' : 'No images', 'Some images have no alt text', 'Add alt text; many clients block images by default.')
  add('stylesheet', !/<link[^>]+rel=["']stylesheet["']/.test(lower) && !/@import/.test(lower), 'warn', 'No external stylesheets', 'Links an external stylesheet', 'Most email clients ignore it. Use inline styles or a <style> block.')
  add('inline', /style=["']/.test(lower), 'warn', 'Inline styles used', 'No inline styles', 'Gmail strips some <style> rules. Inline the important styles.')
  add('size', new Blob([h]).size < 100 * 1024, 'warn', 'Under 100 KB', 'Larger than 100 KB', 'Gmail clips messages over about 102 KB.')
  return out
}
