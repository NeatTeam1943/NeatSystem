import type { Plugin } from 'postcss'

/**
 * PostCSS plugin: every CSS file inside systems/<folder>/ is scoped to
 * [data-sys="<folder>"], the wrapper NeatSystem puts around that tab. A tab's
 * own styles therefore can never restyle the shell or another tab.
 *   .card {}                         -> [data-sys="x"] .card {}
 *   body, :root, html                -> [data-sys="x"]
 *   body .x                          -> [data-sys="x"] .x
 *   :root[data-theme="dark"] .x      -> :root[data-theme="dark"] [data-sys="x"] .x   (theme switches stay on <html>)
 * @keyframes / @font-face are left alone.
 */
export function scopeSystems(): Plugin {
  return {
    postcssPlugin: 'neatsystem-scope-systems',
    Once(root) {
      const file = root.source?.input.file ?? ''
      const m = file.replace(/\\/g, '/').match(/\/systems\/([^/]+)\//)
      if (!m || file.includes('/node_modules/')) return
      const scope = `[data-sys="${m[1]}"]`
      root.walkRules((rule) => {
        const parent = rule.parent as { type?: string; name?: string } | undefined
        if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name ?? '')) return
        rule.selectors = rule.selectors.map((sel) => {
          const s = sel.trim()
          if (s.startsWith(scope)) return s
          const top = s.match(/^(html|body|:root)((?:\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?)*)(?=$|[\s>+~])/)
          if (top) {
            const rest = s.slice(top[0].length).trim()
            // html[data-theme=dark] / :root:not(...) is a condition on the page: keep it as an ancestor
            if (top[2] && top[1] !== 'body') return `${top[1]}${top[2]} ${scope}${rest ? ` ${rest}` : ''}`
            return `${scope}${rest ? ` ${rest}` : ''}`
          }
          return `${scope} ${s}`
        })
      })
    },
  }
}
