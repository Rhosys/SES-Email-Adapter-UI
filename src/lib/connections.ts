// Maps an Authress identity-connection id to a known provider and its display
// label. Connection ids are the ids configured in the Authress management
// portal — for the providers we support they *contain* the provider name, but
// they are not equal to it (e.g. `google-prod`, `con_…github…`), so we match by
// substring, never equality.

export type ConnectionProvider = 'google' | 'github' | 'microsoft' | 'apple' | 'facebook' | 'generic'

const PROVIDER_LABELS: Record<Exclude<ConnectionProvider, 'generic'>, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft / Azure',
  apple: 'Apple',
  facebook: 'Facebook',
}

export function connectionProvider(connectionId: string): ConnectionProvider {
  const s = connectionId.toLowerCase()
  if (s.includes('google')) return 'google'
  if (s.includes('github')) return 'github'
  if (s.includes('microsoft') || s.includes('azure')) return 'microsoft'
  if (s.includes('apple')) return 'apple'
  if (s.includes('facebook')) return 'facebook'
  return 'generic'
}

/** Human-readable provider name, falling back to the raw connection id. */
export function connectionLabel(connectionId: string): string {
  const provider = connectionProvider(connectionId)
  return provider === 'generic' ? connectionId : PROVIDER_LABELS[provider]
}
