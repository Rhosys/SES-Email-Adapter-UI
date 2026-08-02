interface CurrencyConfig {
  code: string
  symbol: string
  rates: Record<string, number> // multiplier from EUR base price
}

const CURRENCIES: Record<string, CurrencyConfig> = {
  EUR: { code: 'EUR', symbol: '€', rates: { '0': 0, '2': 2, '6': 6, '10': 10, '100': 100, '1000': 1000 } },
  USD: { code: 'USD', symbol: '$', rates: { '0': 0, '2': 2, '6': 7, '10': 11, '100': 110, '1000': 1100 } },
  CHF: { code: 'CHF', symbol: 'CHF ', rates: { '0': 0, '2': 2, '6': 6, '10': 10, '100': 100, '1000': 1000 } },
}

function detectCurrency(): CurrencyConfig {
  const locale = navigator.language || 'en'
  const region = locale.split('-')[1]?.toUpperCase() || new Intl.Locale(locale).maximize().region || ''

  if (['US', 'CA', 'AU', 'NZ', 'GB'].includes(region)) return CURRENCIES.USD
  if (region === 'CH' || region === 'LI') return CURRENCIES.CHF
  return CURRENCIES.EUR
}

export function useCurrency() {
  const currency = detectCurrency()

  function formatPrice(eurBasePrice: number): string {
    const key = String(eurBasePrice)
    const localPrice = currency.rates[key] ?? eurBasePrice
    if (localPrice === 0) return `${currency.symbol}0`
    return `${currency.symbol}${localPrice.toLocaleString()}`
  }

  return { currency, formatPrice }
}
