// Categories, merchants and the raw-name -> merchant rules we decided on together.
// Idempotent: safe to rerun after editing. `bun run rules [profile-slug]` (default: joint)
import { config } from 'dotenv'

import * as schema from '../src/db/schema.ts'

// Load env before importing anything that opens the database at module load.
config({ path: ['.env.local', '.env'] })
const { db } = await import('../src/db/index.ts')
const { applyRules } = await import('../src/server/classify.ts')
const { eq } = await import('drizzle-orm')

const slug = process.argv[2] ?? 'joint'
const org = db.select().from(schema.organization).where(eq(schema.organization.slug, slug)).get()
if (!org) throw new Error(`No profile with slug "${slug}"`)
const orgId = org.id

type CategoryDef = { budget?: number; excluded?: boolean }
// merchant -> [category, ...raw-name substrings (lowercase)]
type MerchantDef = [string, ...string[]]
type ProfileRules = {
  categories: Record<string, CategoryDef>
  merchants: Record<string, MerchantDef>
}

const JOINT: ProfileRules = {
  categories: {
    Groceries: { budget: 500 },
    Coffee: { budget: 60 },
    'Eating out': { budget: 250 },
    Bakery: {},
    Transport: {},
    Home: {},
    Shopping: {},
    Insurance: {},
    Entertainment: {},
    Telecom: {},
    Utilities: {},
    Rent: {},
    Cash: {},
    'Bank fees': {},
    Income: { excluded: true },
    Transfer: { excluded: true },
  },
  merchants: {
    SNCF: ['Transport', 'sncf'],
    Railrest: ['Transport', 'railrest'],
    Bolt: ['Transport', 'bolt.eu'],
    Cofiroute: ['Transport', 'cofiroute'],
    'Farm Coop': ['Groceries', 'farm coop'],
    Biocoop: ['Groceries', 'merci la terre'],
    'The Barn': ['Groceries', 'the barn'],
    'So Bio': ['Groceries', 'so.bio'],
    Carrefour: ['Groceries', 'carrefour', 'mkt crf'],
    'Le Pois Tout Vert': ['Groceries', 'lepoistoutvert'],
    'Nous Anti Gaspi': ['Groceries', 'nous anti gaspi'],
    Auchan: ['Groceries', 'auchan'],
    'La Recharge': ['Groceries', 'la recharge'],
    'U Express': ['Groceries', 'u express'],
    'Grand Frais': ['Groceries', 'grand frais'],
    'La Vie Saine': ['Groceries', 'la vie saine'],
    Delhaize: ['Groceries', 'delhaize'],
    'La Fourche': ['Groceries', 'la fourche'],
    'Foch Distribution': ['Groceries', 'foch distribution'],
    'MFR Team': ['Groceries', 'mfr team'],
    Gravaine: ['Coffee', 'gravaine'],
    "Jeff's Coffee": ['Coffee', 'jeffs coffee', 'jeff s coffee'],
    'Café Capitale': ['Coffee', 'cafe capitale'],
    'Experience Café': ['Coffee', 'experience cafe'],
    'Coco La Boulange': ['Bakery', 'coco la boulange'],
    'Maison Dandoy': ['Bakery', 'dandoy'],
    'Pain Merry': ['Bakery', 'pain sarl eurl merry'],
    'Pétrin Bordelais': ['Bakery', 'petrin bordelai'],
    'Glaçage Mérode': ['Bakery', 'glacage merode'],
    Nicos: ['Eating out', 'nicos'],
    'Le Bourbon': ['Eating out', 'le bourbon'],
    'Goutez Moi Ca': ['Eating out', 'goutez moi ca'],
    Pickles: ['Eating out', 'pickles'],
    'Sunset Bowls': ['Eating out', 'sunset bowls'],
    'Rotisserie Victor': ['Eating out', 'rotisserie vic'],
    'Indian Confluence': ['Eating out', 'indian confluence'],
    'Nour Bordeaux': ['Eating out', 'nour bordeaux'],
    'Areas Roissy': ['Eating out', 'areas roissy'],
    'Maison Antoine': ['Eating out', 'maison antoine'],
    'Au Fil Du Linge': ['Home', 'au fil du linge'],
    IKEA: ['Home', 'ikea'],
    'Leroy Merlin': ['Home', 'leroy merlin'],
    Action: ['Home', 'action ', '2416 brussel'],
    'Brico City': ['Home', 'brico city'],
    Gifi: ['Home', 'gifi'],
    'La Pousse Qui Pousse': ['Home', 'la pousse qui pous'],
    Vinted: ['Shopping', 'vinted'],
    'My Lubie': ['Shopping', 'my lubie'],
    Amazon: ['Shopping', 'amazon'],
    Fnac: ['Shopping', 'fnac'],
    AXA: ['Insurance', 'axa belgium'],
    'Grand Ecran': ['Entertainment', 'grand ecran'],
    Free: ['Telecom', 'free telecom', 'free mobile'],
    TotalEnergies: ['Utilities', 'totalenergies'],
    'Sabine Marzat': ['Rent', 'sabine marzat'],
    'Cash withdrawal': ['Cash', 'retrait au distributeur'],
    'Crédit Agricole fees': ['Bank fees', 'cotisation offre'],
    CAF: ['Income', 'caf de la gironde'],
    Herbie: ['Transfer', 'herbie vine', 'vers herbie revolut', 'de monsieur vine herbie'],
    Aliénor: ['Transfer', 'aliénor', 'alienor'],
    'Card checks': ['Transfer', 'gpay temp', 'temporary hold'],
  },
}

const PERSONAL: ProfileRules = {
  categories: {
    Groceries: {},
    Coffee: {},
    Bakery: {},
    'Eating out': {},
    Transport: {},
    Home: {},
    Shopping: {},
    Subscriptions: {},
    'Health & fitness': {},
    Insurance: {},
    Telecom: {},
    'Bank fees': {},
    'Admin & taxes': {},
    'Crypto & investing': { excluded: true },
    Income: { excluded: true },
    Transfer: { excluded: true },
  },
  merchants: {
    Bitcoin: ['Crypto & investing', 'exchanged to btc'],
    Coinbase: ['Crypto & investing', 'coinbase'],
    'PEA / CTO': [
      'Crypto & investing',
      'pea/cto',
      'vers herbie tr',
      'sur pea',
      'pea monsieur vine herbie',
    ],
    'Boursorama AV': ['Crypto & investing', 'bourso av'],
    Terros: ['Income', 'terros'],
    'Vinted payouts': ['Income', 'mangopay'],
    'SNCF refund': ['Income', 'sncf mobilites voyages rmbt'],
    Anthropic: ['Subscriptions', 'anthropic'],
    'Amazon Prime': ['Subscriptions', 'amazon prime'],
    Hetzner: ['Subscriptions', 'hetzner'],
    Typology: ['Subscriptions', 'typology'],
    'La Fourche membership': ['Subscriptions', 'la fourche adhesion'],
    Dott: ['Transport', 'dott'],
    Villo: ['Transport', 'villo'],
    Voi: ['Transport', 'voi technology'],
    STIB: ['Transport', 'stib'],
    IDFM: ['Transport', 'idfm'],
    SNCF: ['Transport', 'sncf'],
    Eurostar: ['Transport', 'eurostar'],
    'Basic Fit': ['Health & fitness', 'basic fit'],
    Carrefour: ['Groceries', 'carrefour', 'mkt crf'],
    'The Barn': ['Groceries', 'the barn'],
    Végétopie: ['Groceries', 'vegetopie'],
    'La Fourche': ['Groceries', 'la fourche'],
    Urbiveto: ['Groceries', 'urbiveto'],
    Terravita: ['Groceries', 'terravita'],
    "Jeff's Coffee": ['Coffee', 'jeffs coffee', 'jeff s coffee'],
    'M.C.J': ['Coffee', 'm.c.j'],
    Sabruma: ['Bakery', 'sabruma'],
    Amazon: ['Shopping', 'amazon'],
    Vinted: ['Shopping', 'vinted'],
    'Librairie Mollat': ['Shopping', 'mollat'],
    'Bootik Roodebeek': ['Shopping', 'bootik'],
    Kubii: ['Shopping', 'kubii'],
    'Au Fil Du Linge': ['Home', 'au fil du linge'],
    Lab9: ['Home', 'lab9'],
    Predica: ['Insurance', 'predica'],
    'Free Mobile': ['Telecom', 'free mobile'],
    'Crédit Agricole fees': ['Bank fees', 'cotisation offre'],
    'Timbre fiscal': ['Admin & taxes', 'timbre fiscal'],
    'Internal transfers': [
      'Transfer',
      'vers herbie revolut',
      'monsieur vine herbie',
      'herbie andrew quenault vine',
      'herbie vine',
      'madame du parc alienor',
      'aliénor anne océane hu parc',
      'alienor du parc',
      'realisation de pret',
    ],
    'Card checks': ['Transfer', 'gpay temp', 'temporary hold'],
  },
}

const PROFILES: Record<string, ProfileRules> = { joint: JOINT, personal: PERSONAL }
const rules = PROFILES[slug]
if (!rules)
  throw new Error(
    `No rules defined for profile "${slug}" (have: ${Object.keys(PROFILES).join(', ')})`,
  )
const CATEGORIES = rules.categories
const MERCHANTS = rules.merchants

const categoryIds = new Map<string, string>()
for (const [name, { budget, excluded }] of Object.entries(CATEGORIES)) {
  const values = {
    organizationId: orgId,
    name,
    budgetCents: budget === undefined ? null : budget * 100,
    excluded: !!excluded,
  }
  const [row] = db
    .insert(schema.categories)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.categories.organizationId, schema.categories.name],
      set: values,
    })
    .returning({ id: schema.categories.id })
    .all()
  categoryIds.set(name, row.id)
}

let ruleCount = 0
for (const [name, [category, ...patterns]] of Object.entries(MERCHANTS)) {
  const categoryId = categoryIds.get(category)
  if (!categoryId) throw new Error(`Merchant ${name}: unknown category ${category}`)
  const [m] = db
    .insert(schema.merchants)
    .values({ organizationId: orgId, name, categoryId })
    .onConflictDoUpdate({
      target: [schema.merchants.organizationId, schema.merchants.name],
      set: { categoryId },
    })
    .returning({ id: schema.merchants.id })
    .all()
  for (const pattern of patterns) {
    db.insert(schema.merchantRules)
      .values({ organizationId: orgId, pattern, merchantId: m.id })
      .onConflictDoUpdate({
        target: [schema.merchantRules.organizationId, schema.merchantRules.pattern],
        set: { merchantId: m.id },
      })
      .run()
    ruleCount++
  }
}

// Re-run rules over everything, including rows classified by an older rule.
db.update(schema.transactions)
  .set({ merchantId: null })
  .where(eq(schema.transactions.organizationId, orgId))
  .run()
const classified = applyRules(orgId)
console.log(
  `${categoryIds.size} categories, ${Object.keys(MERCHANTS).length} merchants, ${ruleCount} rules; classified ${classified} transactions`,
)
