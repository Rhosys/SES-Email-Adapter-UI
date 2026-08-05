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

// IANA timezones → currency. Unlisted timezones default to EUR.
const TZ_CURRENCY: Record<string, string> = {
  'Europe/Zurich': 'CHF',
  'America/New_York': 'USD',
  'America/Chicago': 'USD',
  'America/Denver': 'USD',
  'America/Los_Angeles': 'USD',
  'America/Anchorage': 'USD',
  'America/Phoenix': 'USD',
  'America/Boise': 'USD',
  'America/Detroit': 'USD',
  'America/Indiana/Indianapolis': 'USD',
  'America/Toronto': 'USD',
  'America/Vancouver': 'USD',
  'America/Edmonton': 'USD',
  'America/Winnipeg': 'USD',
  'America/Halifax': 'USD',
  'Pacific/Honolulu': 'USD',
  'Pacific/Auckland': 'USD',
  'Australia/Sydney': 'USD',
  'Australia/Melbourne': 'USD',
  'Australia/Brisbane': 'USD',
  'Australia/Perth': 'USD',
  'Australia/Adelaide': 'USD',
  'Australia/Hobart': 'USD',
  'Europe/London': 'USD',
}

function detectCurrency(): CurrencyConfig {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const code = TZ_CURRENCY[tz] ?? 'EUR'
  return CURRENCIES[code] ?? CURRENCIES.EUR
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
