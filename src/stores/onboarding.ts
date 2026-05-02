import { defineStore } from 'pinia';
import type { DnsRecord, FilterMode } from '@/types/server';

export type StepId = 1 | 2 | 3 | 4 | 5;
export const TOTAL_STEPS: StepId = 5;

interface OnboardingState {
  step: StepId;
  domain: string;
  dnsRecords: DnsRecord[];
  testEmailTo: string | null;
  signalReceived: boolean;
  senderAddress: string;
  displayName: string;
  filterMode: FilterMode;
}

export const useOnboardingStore = defineStore('onboarding', {
  state: (): OnboardingState => ({
    step: 1,
    domain: '',
    dnsRecords: [],
    testEmailTo: null,
    signalReceived: false,
    senderAddress: '',
    displayName: '',
    filterMode: 'balanced'
  }),
  getters: {
    isLastStep: (s) => s.step === TOTAL_STEPS,
    canAdvance(s): boolean {
      switch (s.step) {
        case 1: return s.domain.length > 0 && s.dnsRecords.length > 0;
        case 2: return s.signalReceived;
        case 3: return s.senderAddress.length > 0 && s.displayName.length > 0;
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
    setDomain(domain: string, records: DnsRecord[]): void {
      this.domain = domain;
      this.dnsRecords = records;
    },
    setTestEmail(to: string): void {
      this.testEmailTo = to;
      this.signalReceived = false;
    },
    markSignalReceived(): void {
      this.signalReceived = true;
    },
    setSender(address: string, displayName: string): void {
      this.senderAddress = address;
      this.displayName = displayName;
    },
    setFilterMode(mode: FilterMode): void {
      this.filterMode = mode;
    }
  }
});
