import { makeMoneyBridge, moneyStorageKey } from '@/features/money/bridge'

const MT_APP = 'https://neatteam1943.github.io/MoneyTeam/'
const MT_SB = 'https://abcdefgh.supabase.co'

describe('MoneyTeam bridge', () => {
  it('uses the same storage key supabase-js gives MoneyTeam by default', () => {
    expect(moneyStorageKey(MT_SB)).toBe('sb-abcdefgh-auth-token')
  })

  it('starts the Google login on MoneyTeam\'s behalf: verifier under MoneyTeam\'s key, plain redirect, login hint', async () => {
    localStorage.clear()
    const tab = { opener: {}, location: { href: '' } }
    vi.stubGlobal('open', vi.fn(() => tab))
    makeMoneyBridge(MT_APP, MT_SB, 'anon-key').open('', 'student@gmail.com')
    await vi.waitFor(() => expect(tab.location.href).not.toBe(''))
    const url = new URL(tab.location.href)
    expect(url.origin + url.pathname).toBe(`${MT_SB}/auth/v1/authorize`)
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('redirect_to')).toBe(MT_APP) // exactly what MoneyTeam already allows
    expect(url.searchParams.get('login_hint')).toBe('student@gmail.com')
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    // MoneyTeam's own client (auth-js 2.110.8) reads exactly this key when it gets ?code=
    expect(localStorage.getItem('sb-abcdefgh-auth-token-code-verifier')).toBeTruthy()
    expect(tab.opener).toBeNull()
  })

  it('opens MoneyTeam directly when a MoneyTeam session already exists', async () => {
    localStorage.clear()
    localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({
      access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
    }))
    const tab = { opener: {}, location: { href: '' } }
    vi.stubGlobal('open', vi.fn(() => tab))
    makeMoneyBridge(MT_APP, MT_SB, 'anon-key').open('#/shopping', 'student@gmail.com')
    await vi.waitFor(() => expect(tab.location.href).toBe(MT_APP + '#/shopping'))
  })
})
