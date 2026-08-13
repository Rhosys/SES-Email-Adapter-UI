import { describe, it, expect } from 'vitest'
import { visibleLabels } from '@/lib/labels'

describe('visibleLabels', () => {
  it('hides all system:* labels', () => {
    expect(visibleLabels(['system:workflow:auth', 'lbl_1', 'system:spam', 'lbl_2'])).toEqual(['lbl_1', 'lbl_2'])
  })

  it('keeps user-defined labels unchanged', () => {
    expect(visibleLabels(['lbl_1', 'lbl_2'])).toEqual(['lbl_1', 'lbl_2'])
  })

  it('returns an empty array when only system labels are present', () => {
    expect(visibleLabels(['system:workflow:package'])).toEqual([])
  })
})
