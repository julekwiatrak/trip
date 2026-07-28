export const countryOptions = [
  { code: "GB", name: "United Kingdom", timeZone: "Europe/London" },
  { code: "PL", name: "Poland", timeZone: "Europe/Warsaw" },
  { code: "DE", name: "Germany", timeZone: "Europe/Berlin" },
  { code: "FR", name: "France", timeZone: "Europe/Paris" },
  { code: "ES", name: "Spain", timeZone: "Europe/Madrid" },
] as const;

export type SupportedCountryCode = (typeof countryOptions)[number]["code"];

export function countryByCode(code: string) {
  return countryOptions.find((country) => country.code === code);
}
