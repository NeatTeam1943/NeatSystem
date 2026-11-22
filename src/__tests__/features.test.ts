import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { FEATURES } from '@/app/features'

/** Every hub.register_permissions(...) list in the migrations, by feature id. */
function migrationPermissions() {
  const dir = join(__dirname, '../../supabase/migrations')
  const out = new Map<string, { key: string; label: string; roles: string[] }[]>()
  for (const f of readdirSync(dir)) {
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/hub\.register_permissions\('([a-z]+)',\s*'(\[[\s\S]*?\])'::jsonb\)/g)) {
      out.set(m[1], JSON.parse(m[2].replace(/''/g, "'")))
    }
  }
  return out
}

describe('features', () => {
  test('ids, routes and nav are unique', () => {
    const ids = FEATURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const paths = FEATURES.flatMap((f) => (f.routes ?? []).map((r) => r.path))
    expect(new Set(paths).size).toBe(paths.length)
  })

  test("a feature's declared permissions are the ones its migration registers", () => {
    const sql = migrationPermissions()
    for (const f of FEATURES.filter((x) => x.permissions?.length)) {
      expect(sql.has(f.id), `no hub.register_permissions('${f.id}', …) in a migration`).toBe(true)
      for (const p of f.permissions!) expect(p.key.startsWith(`${f.id}.`)).toBe(true)
      const declared = f.permissions!.map((p) => ({ key: p.key, label: p.label, roles: [...p.roles].sort() }))
      const registered = (sql.get(f.id) ?? []).map((p) => ({ key: p.key, label: p.label, roles: [...p.roles].sort() }))
      expect(declared).toEqual(registered)
    }
  })
})
