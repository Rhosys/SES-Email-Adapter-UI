export type SettingsTabKey = 'profile' | 'emails' | 'email-forwarding' | 'team' | 'billing'

/**
 * Single source of truth for Settings tab metadata — used by SettingsView (tab
 * strip, bottom bar, tab switching) and AppLayout (mobile Settings header
 * title), so the two never drift.
 */
export const SETTINGS_TABS: { key: SettingsTabKey; label: string; mobileLabel?: string; description: string }[] = [
  { key: 'emails', label: 'Aliases', description: 'Manage email addresses and sender policies' },
  { key: 'email-forwarding', label: 'Email & Forwarding', mobileLabel: 'Email', description: 'Domains, forwarding targets, and compose behavior' },
  { key: 'profile', label: 'Profile', description: 'Your identity, security, and linked accounts' },
  { key: 'team', label: 'Team', description: 'Members, roles, and invitations' },
  { key: 'billing', label: 'Billing', description: 'Manage your plan and payment details' },
]

/** Older ?tab= values from before tabs were merged, mapped to their current key. */
export const LEGACY_SETTINGS_TAB_MAP: Record<string, SettingsTabKey> = {
  email: 'email-forwarding',
  forwarding: 'email-forwarding',
  domains: 'email-forwarding',
}

const SETTINGS_TAB_KEYS: SettingsTabKey[] = SETTINGS_TABS.map((t) => t.key)

/** Resolves a raw `?tab=` query value (possibly legacy) to a known tab, or undefined. */
export function resolveSettingsTab(rawTab: string | undefined): SettingsTabKey | undefined {
  if (!rawTab) return undefined
  const tab = (LEGACY_SETTINGS_TAB_MAP[rawTab] ?? rawTab) as SettingsTabKey
  return SETTINGS_TAB_KEYS.includes(tab) ? tab : undefined
}

/** Label for the given tab key, defaulting to the Profile tab's label. */
export function settingsTabLabel(key: SettingsTabKey | undefined): string {
  const resolved = key ?? 'profile'
  return SETTINGS_TABS.find((t) => t.key === resolved)?.label ?? 'Settings'
}
