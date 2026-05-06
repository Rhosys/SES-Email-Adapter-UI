import { defineStore } from 'pinia';
import type { Arc, DnsRecord, SenderFilterMode } from '@/types/server';

export type StepId = 1 | 2 | 3 | 4 | 5;
export const TOTAL_STEPS: StepId = 5;

interface OnboardingState {
  step: StepId;
  domain: string;
  domainId: string | null;
  dnsRecords: DnsRecord[];
  testArc: Arc | null;
  filterMode: SenderFilterMode;
}

export const useOnboardingStore = defineStore('onboarding', {
  state: (): OnboardingState => ({
    step: 1,
    domain: '',
    domainId: null,
    dnsRecords: [],
    testArc: null,
    filterMode: 'notify_new'
  }),
  getters: {
    isLastStep: (s) => s.step === TOTAL_STEPS,
    mxRecord: (s) => s.dnsRecords.find((r) => r.type === 'MX') ?? null,
    senderRecords: (s) => s.dnsRecords.filter((r) => r.type !== 'MX'),
    receivingVerified(): boolean {
      return this.mxRecord?.status === 'verified';
    },
    sendingVerified(s): boolean {
      const senders = s.dnsRecords.filter((r) => r.type !== 'MX');
      return senders.length > 0 && senders.every((r) => r.status === 'verified');
    },
    canAdvance(s): boolean {
      switch (s.step) {
        case 1: return s.domain.length > 0 && s.dnsRecords.length > 0;
        case 2: return s.testArc !== null;
        case 3: return true;
        case 4: return !!s.filterMode;
        case 5: return true;
      }
    }
  },
  actions: {
    next(): void {
      if (this.step < TOTAL_STEPS) this.step = (this.step + 1) as StepId;
    },
    back(): void {
      if (this.step > 1) this.step = (this.step - 1) as StepId;
    },
    setDomain(domain: string, domainId: string): void {
      this.domain = domain;
      this.domainId = domainId;
    },
    setDnsRecords(records: DnsRecord[]): void {
      this.dnsRecords = records;
    },
    setTestArc(arc: Arc): void {
      this.testArc = arc;
    },
    setFilterMode(mode: SenderFilterMode): void {
      this.filterMode = mode;
    }
  }
});
