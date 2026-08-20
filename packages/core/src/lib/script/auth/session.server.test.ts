import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

/**
 * The session store against a storage stub that actually enforces preconditions.
 *
 * The rules layer is tested without storage in `session.test.ts`; what is left here is everything
 * that only exists once records are written — that a stored record is signed and holds no usable
 * token, that reuse removes the family rather than merely reporting it, and that two requests
 * rotating at once produce a continued session rather than a revoked one.
 *
 * The stub honours `ifAbsent` and `ifVersion` because the lost-write race is the case worth having:
 * a stub that accepted every write would make the race untestable and the test reassuring.
 */

interface StoredObject { data: string, version: string }

const objects = new Map<string, StoredObject>()
const secrets = new Map<string, string>()
let versionCounter = 0

class PreconditionFailed extends Error {
  code = 'precondition-failed'
}

function put (name: string, data: string, options?: { ifAbsent?: boolean, ifVersion?: string }): void {
  const existing = objects.get(name)
  if (options?.ifAbsent === true && existing !== undefined) {
    throw new PreconditionFailed(`exists: ${name}`)
  }
  if (options?.ifVersion !== undefined && existing?.version !== options.ifVersion) {
    throw new PreconditionFailed(`version mismatch: ${name}`)
  }
  objects.set(name, { data, version: `v${++versionCounter}` })
}

vi.mock('$lib/script/secrets/providers.server', () => ({
  getSecret: async (key: string) => secrets.get(key),
  setSecret: async (key: string, value: string) => { secrets.set(key, value); return true },
  deleteSecret: async (key: string) => secrets.delete(key),
  setSecretIfAbsent: async (key: string, value: string) => {
    if (secrets.has(key)) return false
    secrets.set(key, value)
    return true
  },
  getOrClaimSecret: async (key: string, generate: () => string) => {
    const existing = secrets.get(key)
    if (existing !== undefined) return { value: existing, claimed: false }
    const value = generate()
    secrets.set(key, value)
    return { value, claimed: true }
  }
}))

vi.mock('$lib/script/storage/storage.server', () => {
  const notFound = (name: string): never => { throw new Error(`no such object: ${name}`) }
  return {
    defaultBucketId: 'test-bucket',
    getObject: async ({ name }: { name: string }) => {
      const stored = objects.get(name)
      if (stored === undefined) notFound(name)
      return { data: stored?.data, version: stored?.version }
    },
    uploadObject: async (
      { name }: { name: string },
      data: string,
      options?: { ifAbsent?: boolean, ifVersion?: string }
    ) => { put(name, data, options) },
    deleteInternalObject: async (path: string) => {
      if (!objects.delete(path)) notFound(path)
    },
    getInternalObjectStringVersioned: async (path: string) => {
      const stored = objects.get(path)
      if (stored === undefined) notFound(path)
      return { text: stored?.data, version: stored?.version }
    },
    uploadInternalObjectJSON: async (path: string, data: unknown) => {
      put(path, JSON.stringify(data))
    }
  }
})

vi.mock('$lib/script/utils.server', () => ({
  streamToString: async (data: string) => data
}))

const SUBJECT = 'subject-1'
const EMAIL = 'admin@example.com'

type SessionModule = typeof import('./session.server')

let sessions: SessionModule

/**
 * Bootstrapping mints a root key, which is an SLH-DSA keygen and costs roughly a second. Done once:
 * every case here shares the same signing key, and none of them cares which key it is.
 */
beforeAll(async () => {
  objects.clear()
  secrets.clear()
  const { ensureInstanceInitialised } = await import('$lib/script/bootstrap.server')
  await ensureInstanceInitialised()
  sessions = await import('./session.server')
}, 60_000)

/** Removes session records between cases while leaving the keys and registry bootstrap produced. */
beforeEach(() => {
  for (const name of [...objects.keys()]) {
    if (name.startsWith(sessions.sessionsDirectory)) objects.delete(name)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const storedRecord = (familyId: string): Record<string, unknown> => {
  const stored = objects.get(`${sessions.sessionsDirectory}/${familyId}.json`)
  expect(stored).toBeDefined()
  return JSON.parse(stored?.data as string)
}

describe('starting a session', () => {
  it('stores a signed envelope of the session document type', async () => {
    const { familyId } = await sessions.startSession(SUBJECT, EMAIL)
    const envelope = storedRecord(familyId)

    expect(envelope.type).toBe('genoacms.session.v1')
    expect(typeof envelope.signature).toBe('string')
    expect(typeof envelope.keyId).toBe('string')
  })

  it('records the subject and email, and no token', async () => {
    const { familyId, token } = await sessions.startSession(SUBJECT, EMAIL)
    const raw = objects.get(`${sessions.sessionsDirectory}/${familyId}.json`)?.data as string

    expect(storedRecord(familyId).payload).toMatchObject({ subject: SUBJECT, email: EMAIL })
    // The token exists only in the client's cookie. Reading the bucket must not yield a session.
    expect(raw).not.toContain(token)
  })

  it('reports the family expiry, so the cookie can outlive the browser session', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const { expiresAt } = storedRecord(started.familyId).payload as { expiresAt: number }

    // Without this the refresh cookie would last until the browser closed, and the configured
    // family lifetime would describe something no client could reach.
    expect(started.expiresAt).toBe(expiresAt)
    expect(started.expiresAt).toBeGreaterThan(Date.now())
  })

  it('gives each session its own family', async () => {
    const first = await sessions.startSession(SUBJECT, EMAIL)
    const second = await sessions.startSession(SUBJECT, EMAIL)

    expect(first.familyId).not.toBe(second.familyId)
    expect(first.token).not.toBe(second.token)
  })
})

describe('refreshing', () => {
  it('exchanges the current token for a successor', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const result = await sessions.refreshSession(started.familyId, started.token)

    expect(result).toMatchObject({ outcome: 'refreshed', subject: SUBJECT, email: EMAIL })
    if (result.outcome !== 'refreshed') throw new Error('unreachable')
    expect(result.token).not.toBe(started.token)
    // The family does not live longer for being used; renewal carries the original expiry.
    expect(result.expiresAt).toBe(started.expiresAt)
  })

  it('advances the generation and keeps the record signed', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    expect((storedRecord(started.familyId).payload as { generation: number }).generation).toBe(1)

    await sessions.refreshSession(started.familyId, started.token)

    const envelope = storedRecord(started.familyId)
    expect((envelope.payload as { generation: number }).generation).toBe(2)
    expect(typeof envelope.signature).toBe('string')
  })

  it('accepts the successor on the next refresh', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const first = await sessions.refreshSession(started.familyId, started.token)
    if (first.outcome !== 'refreshed') throw new Error('unreachable')

    expect((await sessions.refreshSession(started.familyId, first.token)).outcome).toBe('refreshed')
  })

  it('rejects an unknown family', async () => {
    expect(await sessions.refreshSession('no-such-family', 'whatever'))
      .toMatchObject({ outcome: 'rejected', reason: 'unknown-session' })
  })

  it('rejects a token that never belonged to the family', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const other = await sessions.startSession(SUBJECT, EMAIL)

    expect((await sessions.refreshSession(started.familyId, other.token)).outcome).toBe('rejected')
  })
})

describe('reuse', () => {
  /**
   * The grace window is measured against the wall clock, so a superseded token is accepted for ten
   * real seconds. Moving the clock is what separates "the client's own second request" from a
   * replay — without it this case would assert the concurrent path and be named for the other one.
   */
  const afterGraceWindow = (): void => {
    const later = Date.now() + 60_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
  }

  it('revokes the family when a superseded token comes back later', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    await sessions.refreshSession(started.familyId, started.token)

    afterGraceWindow()
    const result = await sessions.refreshSession(started.familyId, started.token)

    expect(result).toMatchObject({ outcome: 'rejected', reason: 'token-reused' })
  })

  it('ends the session for the legitimate holder too', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const rotated = await sessions.refreshSession(started.familyId, started.token)
    if (rotated.outcome !== 'refreshed') throw new Error('unreachable')

    afterGraceWindow()
    await sessions.refreshSession(started.familyId, started.token)

    // The whole point: the thief and the user cannot be told apart, so neither keeps the session.
    expect(await sessions.loadFamily(started.familyId)).toBeUndefined()
    expect((await sessions.refreshSession(started.familyId, rotated.token)).outcome).toBe('rejected')
  })

  it('accepts the immediately superseded token inside the window', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    await sessions.refreshSession(started.familyId, started.token)

    // A page's second request, still carrying the cookie the first one replaced.
    const result = await sessions.refreshSession(started.familyId, started.token)

    expect(result).toMatchObject({ outcome: 'concurrent', subject: SUBJECT, email: EMAIL })
    expect(await sessions.loadFamily(started.familyId)).toBeDefined()
    // The cookie is rewritten on this path too, so the expiry has to come back with it.
    if (result.outcome !== 'concurrent') throw new Error('unreachable')
    expect(result.expiresAt).toBe(started.expiresAt)
  })

  it('does not rotate again on a concurrent presentation', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    await sessions.refreshSession(started.familyId, started.token)
    await sessions.refreshSession(started.familyId, started.token)

    expect((storedRecord(started.familyId).payload as { generation: number }).generation).toBe(2)
  })
})

describe('a lost write race', () => {
  it('continues the session rather than revoking it', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)

    // Both requests read the same version; the second one's conditional write finds it superseded.
    const storage = await import('$lib/script/storage/storage.server')
    const upload = vi.spyOn(storage, 'uploadObject')
    upload.mockImplementationOnce(async () => { throw new PreconditionFailed('lost the race') })

    const result = await sessions.refreshSession(started.familyId, started.token)

    expect(result).toMatchObject({ outcome: 'concurrent', subject: SUBJECT })
    // Nothing was written, so the token the winner issued remains the current one.
    expect((storedRecord(started.familyId).payload as { generation: number }).generation).toBe(1)
  })
})

describe('an expired family', () => {
  it('is rejected and removed', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const { expiresAt } = storedRecord(started.familyId).payload as { expiresAt: number }
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)

    expect(await sessions.refreshSession(started.familyId, started.token))
      .toMatchObject({ outcome: 'rejected', reason: 'expired' })
    expect(objects.has(`${sessions.sessionsDirectory}/${started.familyId}.json`)).toBe(false)
  })
})

describe('a tampered record', () => {
  it('is treated as no session at all', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const path = `${sessions.sessionsDirectory}/${started.familyId}.json`
    const envelope = JSON.parse(objects.get(path)?.data as string)

    // Someone with write access to the bucket promotes themselves. The signature no longer matches.
    envelope.payload.subject = 'attacker'
    objects.set(path, { data: JSON.stringify(envelope), version: 'tampered' })

    expect(await sessions.loadFamily(started.familyId)).toBeUndefined()
    expect((await sessions.refreshSession(started.familyId, started.token)).outcome).toBe('rejected')
  })

  it('is not accepted merely because it parses', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)
    const path = `${sessions.sessionsDirectory}/${started.familyId}.json`

    // An unsigned record of the right shape — the shortcut an attacker would reach for first.
    objects.set(path, {
      data: JSON.stringify({
        familyId: started.familyId,
        subject: 'attacker',
        email: EMAIL,
        currentHash: 'whatever',
        generation: 1,
        createdAt: 0,
        expiresAt: Date.now() + 60_000
      }),
      version: 'unsigned'
    })

    expect(await sessions.loadFamily(started.familyId)).toBeUndefined()
  })
})

describe('revoking', () => {
  it('removes the family and refuses later refreshes', async () => {
    const started = await sessions.startSession(SUBJECT, EMAIL)

    await sessions.revokeSession(started.familyId)

    expect(objects.has(`${sessions.sessionsDirectory}/${started.familyId}.json`)).toBe(false)
    expect((await sessions.refreshSession(started.familyId, started.token)).outcome).toBe('rejected')
  })

  it('treats an already-absent family as success', async () => {
    // Signing out twice, or signing out of a session that expired, must not fail.
    await expect(sessions.revokeSession('no-such-family')).resolves.toBeUndefined()
  })
})
