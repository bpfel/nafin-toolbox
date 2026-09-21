import type { Locale } from '../i18n/index.svelte'

/**
 * Names for the seeded starter budget, in each language.
 *
 * Deliberately not in the i18n catalogue, because these are not interface
 * text. They are written into the user's vault once, as data, and belong to
 * them from that moment: renaming "Wohnen" to "Miete WG" must stick, and it
 * could not if the name were a slug resolved at render.
 *
 * That also means switching language later does not re-translate an existing
 * budget, which is correct. The names were a starting point, and after the
 * first edit they are the user's own words.
 *
 * The set follows the BFS household budget survey, which classifies by COICOP —
 * "Wohnen und Energie", "Verkehr", "Nachrichtenübermittlung", "Bekleidung und
 * Schuhe" and so on. Those official labels are the anchor, but not the wording:
 * a person budgeting writes "Auswärts essen", not "Gast- und
 * Beherbergungsstätten". Where a term is genuinely fixed — Säule 3a, the
 * Krankenkasse — the Swiss name is used as-is.
 */

/** Stable identifiers for each seeded name. Never shown; only looked up. */
export type SeedKey =
  | 'cat.employment' | 'cat.housing' | 'cat.insuranceTaxes'
  | 'cat.living' | 'cat.lifestyle' | 'cat.savings'
  | 'salaryNet' | 'rent' | 'utilities'
  | 'healthInsurance' | 'otherInsurance' | 'taxes'
  | 'groceries' | 'transport' | 'telecoms'
  | 'clothing' | 'entertainment' | 'diningOut'
  | 'savings' | 'pillar3a'
  | 'serafe' | 'laptop'

type SeedNames = Record<SeedKey, string>

const en: SeedNames = {
  'cat.employment': 'Employment',
  'cat.housing': 'Housing',
  'cat.insuranceTaxes': 'Insurance and Taxes',
  'cat.living': 'Living',
  'cat.lifestyle': 'Lifestyle',
  'cat.savings': 'Savings',
  salaryNet: 'Salary (net)',
  rent: 'Rent',
  utilities: 'Utilities',
  healthInsurance: 'Health Insurance',
  otherInsurance: 'Other Insurance',
  taxes: 'Taxes',
  groceries: 'Food & Groceries',
  transport: 'Transportation',
  telecoms: 'Telecommunications',
  clothing: 'Clothing & Footwear',
  entertainment: 'Entertainment & Recreation',
  diningOut: 'Dining Out',
  serafe: 'Serafe',
  laptop: 'Laptop',
  savings: 'Savings',
  pillar3a: 'Pillar 3a',
}

const de: SeedNames = {
  'cat.employment': 'Erwerbstätigkeit',
  'cat.housing': 'Wohnen',
  'cat.insuranceTaxes': 'Versicherungen und Steuern',
  'cat.living': 'Lebenshaltung',
  'cat.lifestyle': 'Freizeit',
  'cat.savings': 'Sparen',
  salaryNet: 'Lohn (netto)',
  rent: 'Miete',
  utilities: 'Nebenkosten',
  healthInsurance: 'Krankenkasse',
  otherInsurance: 'Übrige Versicherungen',
  taxes: 'Steuern',
  groceries: 'Lebensmittel',
  transport: 'Verkehr',
  telecoms: 'Telekommunikation',
  clothing: 'Bekleidung & Schuhe',
  entertainment: 'Unterhaltung & Freizeit',
  diningOut: 'Auswärts essen',
  serafe: 'Serafe',
  laptop: 'Laptop',
  savings: 'Sparen',
  pillar3a: 'Säule 3a',
}

const fr: SeedNames = {
  'cat.employment': 'Activité lucrative',
  'cat.housing': 'Logement',
  'cat.insuranceTaxes': 'Assurances et impôts',
  'cat.living': 'Vie courante',
  'cat.lifestyle': 'Loisirs',
  'cat.savings': 'Épargne',
  salaryNet: 'Salaire (net)',
  rent: 'Loyer',
  utilities: 'Charges',
  healthInsurance: 'Assurance maladie',
  otherInsurance: 'Autres assurances',
  taxes: 'Impôts',
  groceries: 'Alimentation',
  transport: 'Transports',
  telecoms: 'Télécommunications',
  clothing: 'Habillement & chaussures',
  entertainment: 'Loisirs & culture',
  diningOut: 'Repas à l’extérieur',
  serafe: 'Serafe',
  laptop: 'Ordinateur portable',
  savings: 'Épargne',
  pillar3a: 'Pilier 3a',
}

const it: SeedNames = {
  'cat.employment': 'Attività lucrativa',
  'cat.housing': 'Abitazione',
  'cat.insuranceTaxes': 'Assicurazioni e imposte',
  'cat.living': 'Vita quotidiana',
  'cat.lifestyle': 'Tempo libero',
  'cat.savings': 'Risparmio',
  salaryNet: 'Salario (netto)',
  rent: 'Affitto',
  utilities: 'Spese accessorie',
  healthInsurance: 'Cassa malati',
  otherInsurance: 'Altre assicurazioni',
  taxes: 'Imposte',
  groceries: 'Alimentari',
  transport: 'Trasporti',
  telecoms: 'Telecomunicazioni',
  clothing: 'Abbigliamento e calzature',
  entertainment: 'Svago e cultura',
  diningOut: 'Pasti fuori casa',
  serafe: 'Serafe',
  laptop: 'Computer portatile',
  savings: 'Risparmio',
  pillar3a: 'Pilastro 3a',
}

/**
 * Rumantsch is not listed. Seeding in a language we cannot check would write
 * guessed words into someone's budget as data, where they persist and get
 * edited rather than being corrected in one file later. English is the honest
 * starting point until a speaker supplies these.
 */
const CATALOGUES: Partial<Record<Locale, SeedNames>> = { en, de, fr, it }

export function seedNamesFor(locale: Locale): SeedNames {
  return CATALOGUES[locale] ?? en
}
