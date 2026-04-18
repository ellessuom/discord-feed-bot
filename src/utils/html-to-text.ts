/**
 * Convert HTML to plain text by stripping tags and decoding entities.
 *
 * Note: This implementation chains multiple .replace() calls, which creates
 * intermediate strings. For RSS feed content (<1KB typically), this is acceptable.
 * For larger HTML documents, consider using a streaming parser or external library.
 */
export function htmlToText(html: string, maxLength: number = 4096): string {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length <= maxLength) {
    return text
  }

  return text.substring(0, maxLength - 3) + '...'
}
