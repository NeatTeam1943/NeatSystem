/** What kind of link a URL is, for the editor's chip. */
export type LinkKind = 'slides' | 'docs' | 'sheets' | 'forms' | 'drive' | 'canva' | 'video' | 'code' | 'tba' | 'cad' | 'web'

const RULES: [RegExp, string, LinkKind][] = [
  [/docs\.google\.com\/presentation/, 'Google Slides', 'slides'],
  [/docs\.google\.com\/document/, 'Google Docs', 'docs'],
  [/docs\.google\.com\/spreadsheets/, 'Google Sheets', 'sheets'],
  [/docs\.google\.com\/forms|forms\.gle/, 'Google Forms', 'forms'],
  [/drive\.google\.com/, 'Google Drive', 'drive'],
  [/canva\.(com|link)/, 'Canva', 'canva'],
  [/youtube\.com|youtu\.be/, 'YouTube', 'video'],
  [/github\.(com|io)/, 'GitHub', 'code'],
  [/thebluealliance\.com/, 'The Blue Alliance', 'tba'],
  [/onshape\.com/, 'Onshape', 'cad'],
]

export function detectLink(url: string): { name: string; kind: LinkKind } | null {
  if (!url) return null
  for (const [re, name, kind] of RULES) if (re.test(url)) return { name, kind }
  try {
    return { name: new URL(url).hostname.replace(/^www\./, ''), kind: 'web' }
  } catch {
    return null
  }
}

export function isValidUrl(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
