import { describe, it, expect } from 'vitest'
import { handleMockRequest } from './server-handler'
import { mockThreads } from './data/threads'

describe('handleMockRequest — PATCH thread', () => {
  it('applies the patch to the matched thread, not always the first mock thread', async () => {
    const target = mockThreads.find((t) => t.threadId === 'thr_conv_1')!
    expect(target.status).toBe('active')

    const res = await handleMockRequest(
      'PATCH',
      `/accounts/acc_1/threads/${target.threadId}`,
      { status: 'archived', followupAt: '2099-01-01T09:00:00.000Z' },
    )

    expect(res?.status).toBe(200)
    const body = res!.body as typeof target
    expect(body.threadId).toBe('thr_conv_1')
    expect(body.status).toBe('archived')
    expect(body.followupAt).toBe('2099-01-01T09:00:00.000Z')
    // The mutation is reflected in the shared mock data too, so a follow-up GET sees it.
    expect(target.status).toBe('archived')
  })

  it('leaves unrelated threads untouched', async () => {
    const other = mockThreads.find((t) => t.threadId === 'thr_pkg_1')!
    const otherStatusBefore = other.status

    await handleMockRequest('PATCH', '/accounts/acc_1/threads/thr_conv_2', { status: 'deleted' })

    expect(other.status).toBe(otherStatusBefore)
  })

  it('returns 404 for an unknown thread id', async () => {
    const res = await handleMockRequest('PATCH', '/accounts/acc_1/threads/thr_does_not_exist', { status: 'archived' })
    expect(res?.status).toBe(404)
  })
})
