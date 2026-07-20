import { describe, it, expect } from 'vitest'
import { resolveSettingsTab, settingsTabLabel } from '@/lib/settingsTabs'

describe('resolveSettingsTab', () => {
  it('returns undefined for an absent tab', () => {
    expect(resolveSettingsTab(undefined)).toBeUndefined()
  })

  it('returns a known tab as-is', () => {
    expect(resolveSettingsTab('team')).toBe('team')
  })

  it('maps legacy tab keys to their current key', () => {
    expect(resolveSettingsTab('email')).toBe('email-forwarding')
    expect(resolveSettingsTab('forwarding')).toBe('email-forwarding')
    expect(resolveSettingsTab('domains')).toBe('email-forwarding')
  })

  it('returns undefined for an unknown tab', () => {
    expect(resolveSettingsTab('not-a-real-tab')).toBeUndefined()
  })
})

describe('settingsTabLabel', () => {
  it('returns the matching tab label', () => {
    expect(settingsTabLabel('team')).toBe('Team')
    expect(settingsTabLabel('email-forwarding')).toBe('Email & Forwarding')
  })

  it('defaults to the Profile label when no tab is given', () => {
    expect(settingsTabLabel(undefined)).toBe('Profile')
  })
})
