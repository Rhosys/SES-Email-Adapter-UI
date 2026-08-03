export type SettingsTabKey = 'profile' | 'emails' | 'email-forwarding' | 'team' | 'billing'

/**
 * Single source of truth for Settings tab metadata — used by SettingsView (tab
 * strip, bottom bar, tab switching) and AppLayout (mobile Settings header
 * title), so the two never drift.
 */
export const SETTINGS_TABS: { key: SettingsTabKey; label: string; mobileLabel?: string; description: string }[] = [
  { key: 'email-forwarding', label: 'Email & Forwarding', mobileLabel: 'Email', description: 'Domains, forwarding targets, and compose behavior' },
  { key: 'emails', label: 'Aliases', description: 'Manage email addresses and sender policies' },
  { key: 'team', label: 'Team', description: 'Members, roles, and invitations' },
  { key: 'profile', label: 'Profile', description: 'Your identity, security, and linked accounts' },
  { key: 'billing', label: 'Billing', description: 'Manage your plan and payment details' },
]

const SETTINGS_TAB_KEYS: SettingsTabKey[] = SETTINGS_TABS.map((t) => t.key)

/** Resolves a raw tab path segment to a known tab, or undefined. */
export function resolveSettingsTab(rawTab: string | undefined): SettingsTabKey | undefined {
  if (!rawTab) return undefined
  return SETTINGS_TAB_KEYS.includes(rawTab as SettingsTabKey) ? (rawTab as SettingsTabKey) : undefined
}

/** Label for the given tab key, defaulting to the Email & Forwarding tab's label. */
export function settingsTabLabel(key: SettingsTabKey | undefined): string {
  const resolved = key ?? 'email-forwarding'
  return SETTINGS_TABS.find((t) => t.key === resolved)?.label ?? 'Settings'
}
