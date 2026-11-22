import { describe, expect, test } from 'vitest'
import { canDeleteNode, canEditNode, canView, hubPath, recomputeSubtree, resolvePath, slugify } from './model'
import type { Editor, HubNode } from './types'

const node = (n: Partial<HubNode> & Pick<HubNode, 'id' | 'type'>): HubNode => ({
  parentId: null, title: n.id, labelMode: 'txt', labelText: '', imageData: null, imageUrl: null, season: null, piece: null,
  visibility: 'public', effVis: 'public', scope: 'sw', order: 1, ...n,
})
const nodes = [
  node({ id: 'sw', type: 'hub', title: 'תוכנה', slug: 'software' }),
  node({ id: 'v', parentId: 'sw', type: 'hub', title: 'Vision', slug: 'vision', visibility: 'members', effVis: 'members' }),
  node({ id: 'l', parentId: 'v', type: 'link', effVis: 'members' }),
]
const ed = (role: Editor['role'], scopes: string[] = []): Editor => ({ uid: 'u', role, scopes })

describe('NEATHUB model', () => {
  test('paths', () => {
    expect(hubPath(nodes, 'v')).toBe('software/vision')
    expect(resolvePath(nodes, ['software', 'vision'])?.id).toBe('v')
    expect(resolvePath(nodes, ['sw'])?.id).toBe('sw')
    expect(resolvePath(nodes, ['nope'])).toBeNull()
    expect(slugify('Vision 2024!')).toBe('vision-2024')
  })

  test('permissions mirror the SQL', () => {
    const lead = ed('lead', ['sw'])
    expect(canEditNode(lead, nodes[2])).toBe(true)
    expect(canDeleteNode(lead, nodes[0])).toBe(false)
    expect(canDeleteNode(ed('lead', ['sw', 'root']), nodes[0])).toBe(true)
    expect(canEditNode(ed('lead', ['build']), nodes[2])).toBe(false)
    expect(canView(ed('member'), 'members')).toBe(true)
    expect(canView(ed('guest'), 'members')).toBe(false)
    expect(canView(null, 'public')).toBe(true)
  })

  test('visibility flows down the tree', () => {
    const changed = recomputeSubtree(nodes, { ...nodes[0], visibility: 'mentors' })
    expect(changed.find((n) => n.id === 'l')?.effVis).toBe('mentors')
  })

  test('moving a tote to the home page makes it its own scope', () => {
    const changed = recomputeSubtree(nodes, { ...nodes[1], parentId: null })
    expect(changed.find((n) => n.id === 'v')?.scope).toBe('v')
    expect(changed.find((n) => n.id === 'l')?.scope).toBe('v')
  })
})
