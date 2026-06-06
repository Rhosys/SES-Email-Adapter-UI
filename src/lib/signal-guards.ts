import type {
  Signal,
  EmailInboundSignal,
  EmailOutboundSignal,
  DeliverabilitySignal,
  InvalidRuleFunctionSignal,
  InvalidTemplateFunctionSignal,
  AutoSendBlockedSignal,
  CalendarEventSignal,
  CalendarResponseSignal,
  CalendarInviteInvalidSignal,
  DomainMisconfigurationSignal
} from '@/types/server'

export function isEmailSignal(s: Signal): s is EmailInboundSignal | EmailOutboundSignal {
  return s.type === 'email'
}

export function isInboundEmailSignal(s: Signal): s is EmailInboundSignal {
  return s.type === 'email' && 'receivedAt' in s.data
}

export function isOutboundEmailSignal(s: Signal): s is EmailOutboundSignal {
  return s.type === 'email' && 'sendInitiatedAt' in s.data
}

export function isDeliverabilitySignal(s: Signal): s is DeliverabilitySignal {
  return s.type === 'deliverability'
}

export function isInvalidRuleFunctionSignal(s: Signal): s is InvalidRuleFunctionSignal {
  return s.type === 'invalid_rule_function'
}

export function isInvalidTemplateFunctionSignal(s: Signal): s is InvalidTemplateFunctionSignal {
  return s.type === 'invalid_template_function'
}

export function isAutoSendBlockedSignal(s: Signal): s is AutoSendBlockedSignal {
  return s.type === 'auto_send_blocked'
}

export function isCalendarEventSignal(s: Signal): s is CalendarEventSignal {
  return s.type === 'calendar_event'
}

export function isCalendarResponseSignal(s: Signal): s is CalendarResponseSignal {
  return s.type === 'calendar_response'
}

export function isCalendarInviteInvalidSignal(s: Signal): s is CalendarInviteInvalidSignal {
  return s.type === 'calendar_invite_invalid'
}

export function isDomainMisconfigurationSignal(s: Signal): s is DomainMisconfigurationSignal {
  return s.type === 'domain_misconfiguration'
}
