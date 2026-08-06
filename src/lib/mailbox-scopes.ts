// OAuth scopes requested when a user connects an external mailbox.
//
// Authress takes provider scopes at link time via `connectionProperties`, not from static
// connection config, so this is the only place that decides what a connected mailbox can do.
// The backend reads mail through the provider *and* sends through it — sending from a
// @gmail.com or @outlook.com address any other way fails DMARC at the recipient — so both
// read and send scopes have to be granted here.
//
// Widening this list does not upgrade mailboxes that are already connected: OAuth grants are
// fixed at consent time. An existing user has to re-link before the new scope takes effect,
// which is what the "reconnect" path on a failed send is for.

/** Shape Authress' login client accepts for `connectionProperties`. */
export type MailboxConnectionProperties = Record<string, string>

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  // users.watch (push notifications) and messages.get?format=raw
  'https://www.googleapis.com/auth/gmail.readonly',
  // messages.send
  'https://www.googleapis.com/auth/gmail.send',
].join(' ')

const MICROSOFT_SCOPES = [
  'openid',
  'email',
  'profile',
  // Without this Authress gets no refresh token and the connection dies at the first expiry.
  'offline_access',
  // Mail subscriptions and message reads, plus creating the draft that a send is built from.
  // Draft creation is what surfaces internetMessageId, which reply threading is keyed on.
  'https://graph.microsoft.com/Mail.ReadWrite',
  // POST /me/messages/{id}/send
  'https://graph.microsoft.com/Mail.Send',
].join(' ')

/** Connection properties for linking a mailbox of the given platform. */
export function mailboxConnectionProperties(platform: 'gmail' | 'outlook'): MailboxConnectionProperties {
  if (platform === 'gmail') {
    return {
      scope: GOOGLE_SCOPES,
      // Google only returns a refresh token with offline access, and only re-issues one when
      // consent is re-prompted — without both, the connection stops working within the hour.
      access_type: 'offline',
      prompt: 'select_account consent',
    }
  }
  return {
    scope: MICROSOFT_SCOPES,
    prompt: 'select_account consent',
  }
}
