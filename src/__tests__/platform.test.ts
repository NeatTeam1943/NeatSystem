import postcss from 'postcss'
import { parseProfile } from '@/core/profileBlocks'
import { checkTab, isProblem } from '@/core/tabs'
import { loadTabs } from '@/app/tabs'
import { scopeSystems } from '../../scripts/scope-css'

const Root = () => null

describe('tab contract', () => {
  it('accepts a valid tab and refuses broken ones without throwing', () => {
    expect(isProblem(checkTab('x', { default: { contract: 1, id: 'trainings', label: 'הכשרות', Root } }))).toBe(false)
    expect(isProblem(checkTab('x', { default: { contract: 2, id: 'trainings', label: 'x', Root } }))).toBe(true)
    expect(isProblem(checkTab('x', { default: { contract: 1, id: 'people', label: 'x', Root } }))).toBe(true) // reserved
    expect(isProblem(checkTab('x', { default: { contract: 1, id: 'Bad Id', label: 'x', Root } }))).toBe(true)
    expect(isProblem(checkTab('x', {}))).toBe(true)
    expect(isProblem(checkTab('x', null))).toBe(true)
  })

  it('a tab that throws while loading is reported and the others still load', async () => {
    const st = await loadTabs({
      '/systems/good/neatsystem/tab.jsx': async () => ({ default: { contract: 1, id: 'good', label: 'טוב', Root } }),
      '/systems/boom/neatsystem/tab.jsx': async () => { throw new Error('boom') },
      '/systems/dup/neatsystem/tab.jsx': async () => ({ default: { contract: 1, id: 'good', label: 'שוב', Root } }),
    })
    expect(st.tabs.map((t) => t.folder)).toEqual(['good'])
    expect(st.problems.map((p) => p.folder).sort()).toEqual(['boom', 'dup'])
  })
})

describe('profile blocks (what NeatSystem reads from a sub-system)', () => {
  it('parses contract 1 and drops what it does not understand', () => {
    const p = parseProfile({ contract: 1, title: 'הכשרות', link: '/trainings/p/1', blocks: [
      { kind: 'stats', items: [{ label: 'הסמכות', value: 12 }, { label: '', value: 1 }] },
      { kind: 'progress', label: 'לניטר', value: 9, max: 5 },
      { kind: 'video', src: 'x' },
      { kind: 'chips', items: [{ label: 'בנייה', tone: 'nope' }] },
    ] })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.blocks.map((b) => b.kind)).toEqual(['stats', 'progress', 'chips'])
    expect(p.dropped).toBe(1)
    expect(p.blocks[1]).toMatchObject({ value: 5, max: 5 }) // clamped
    expect(p.link).toBe('/trainings/p/1')
  })

  it('never throws on a broken sub-system', () => {
    for (const raw of [null, 'x', 42, [], { contract: 2, blocks: [] }, { contract: 1 }, { contract: 1, blocks: [{ kind: 'stats', items: 'x' }] },
      { error: '42P01', detail: 'relation does not exist' }]) {
      expect(() => parseProfile(raw)).not.toThrow()
      expect(parseProfile(raw).ok).toBe(false)
    }
    expect(parseProfile({ contract: 1, blocks: [] })).toMatchObject({ ok: true, blocks: [] })
    expect(parseProfile({ contract: 1, link: 'https://evil.example', blocks: [] })).toMatchObject({ ok: true, link: undefined })
  })
})

describe('tab CSS is scoped to its tab', () => {
  const run = (css: string, from = '/repo/systems/trainings/src/ui/x.css') => postcss([scopeSystems()]).process(css, { from }).css
  it('prefixes selectors, maps the page roots, keeps theme conditions on <html>', () => {
    expect(run('.card{a:b}')).toBe('[data-sys="trainings"] .card{a:b}')
    expect(run('body{a:b}')).toBe('[data-sys="trainings"]{a:b}')
    expect(run(':root{--x:1}')).toBe('[data-sys="trainings"]{--x:1}')
    expect(run('body .x{a:b}')).toBe('[data-sys="trainings"] .x{a:b}')
    expect(run(':root[data-theme="dark"] .n{a:b}')).toBe(':root[data-theme="dark"] [data-sys="trainings"] .n{a:b}')
    expect(run('@keyframes k{from{a:b}}')).toBe('@keyframes k{from{a:b}}')
  })
  it('leaves NeatSystem\'s own CSS alone', () => {
    expect(run('.card{a:b}', '/repo/src/styles/app.css')).toBe('.card{a:b}')
  })
})
