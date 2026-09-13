export function formatCents(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

/** "ALIÉNOR ANNE" -> "Aliénor" */
export function firstName(fullName: string | null | undefined) {
  const first = fullName?.trim().split(/\s+/)[0]
  if (!first) return ''
  return first.charAt(0).toLocaleUpperCase() + first.slice(1).toLocaleLowerCase()
}

/** The user's label if set, else "Crédit Agricole ·4330" — bank plus the IBAN's last four digits. */
export function accountLabel(
  label: string | null | undefined,
  bank: string | null | undefined,
  iban: string | null | undefined,
) {
  if (label) return label
  if (!bank) return ''
  return iban ? `${bank} ·${iban.slice(-4)}` : bank
}

/**
 * Guess a rule pattern from a raw bank descriptor: drop card/transfer prefixes,
 * trailing dd/mm dates and reference noise, lowercase, collapse spaces.
 */
export function suggestPattern(raw: string) {
  return raw
    .toLowerCase()
    .replace(/^paiement par carte x\d+\s*/, '')
    .replace(/^retrait au distributeur x\d+\s*/, 'retrait au distributeur ')
    .replace(/^prelevement\s+/, '')
    .replace(/^virement (emis|en votre faveur)\s*(web|vir inst)?\s*(vers|de)?\s*/, '')
    .replace(/\s+\d{2}\/\d{2}(\s.*)?$/, '')
    .replace(/\s+\d{6,}.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** "hetzner online gmbh" -> "Hetzner Online Gmbh" */
export function titleCase(s: string) {
  return s.replace(/\S+/g, (w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
}
