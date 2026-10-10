import type { FastifyReply, FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorize } from './authorize'

describe('authorize', () => {
  const status = vi.fn()
  const send = vi.fn()
  const reply = { status, send } as unknown as FastifyReply

  beforeEach(() => {
    vi.clearAllMocks()
    status.mockReturnValue(reply)
    send.mockReturnValue(reply)
  })

  it('returns 403 when the authenticated role is not allowed', async () => {
    const request = { user: { role: 'VIEWER' } } as unknown as FastifyRequest

    await authorize('ADMIN')(request, reply)

    expect(status).toHaveBeenCalledWith(403)
    expect(send).toHaveBeenCalledWith({ message: 'Forbidden' })
  })

  it('returns 403 when the request has no authenticated user', async () => {
    const request = {} as unknown as FastifyRequest

    await authorize('ADMIN')(request, reply)

    expect(status).toHaveBeenCalledWith(403)
    expect(send).toHaveBeenCalledWith({ message: 'Forbidden' })
  })

  it('does not reject a role included in the allowlist', async () => {
    const request = { user: { role: 'OPERATOR' } } as unknown as FastifyRequest

    await authorize('ADMIN', 'OPERATOR')(request, reply)

    expect(status).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
