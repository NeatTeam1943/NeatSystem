import type { Plugin } from 'postcss'

/**
 * PostCSS plugin: every CSS file inside src/features/<id>/ is scoped to
 * [data-feature="<id>"], the wrapper the app puts around that feature's
 * routes (src/app/App.tsx). A feature's styles therefore never restyle the
 * shell or another feature, and its class names can't collide.
 *   .card {}                         -> [data-feature="x"] .card {}
 *   body, :root, html                -> [data-feature="x"]
 *   body .x                          -> [data-feature="x"] .x
 *   :root[data-theme="dark"] .x      -> :root[data-theme="dark"] [data-feature="x"] .x   (theme switches stay on <html>)
 * @keyframes / @font-face are left alone.
 */
export function scopeFeatures(): Plugin {
  return {
    postcssPlugin: 'neatsystem-scope-features',
    Once(root) {
      const file = root.source?.input.file ?? ''
      const m = file.replace(/\\/g, '/').match(/\/src\/features\/([^/]+)\//)
      if (!m || file.includes('/node_modules/')) return
      const scope = `[data-feature="${m[1]}"]`
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
