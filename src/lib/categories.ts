import type { Category } from '@/types'

export const CATEGORIES: Record<Category, { label: string; emoji: string; color: string }> = {
  food: { label: 'Food & drink', emoji: '🍔', color: '#f97316' },
  groceries: { label: 'Groceries', emoji: '🛒', color: '#84cc16' },
  transport: { label: 'Transport', emoji: '🚕', color: '#0ea5e9' },
  stay: { label: 'Accommodation', emoji: '🏨', color: '#8b5cf6' },
  entertainment: { label: 'Entertainment', emoji: '🎟️', color: '#ec4899' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#f43f5e' },
  utilities: { label: 'Utilities', emoji: '💡', color: '#eab308' },
  rent: { label: 'Rent', emoji: '🏠', color: '#14b8a6' },
  health: { label: 'Health', emoji: '💊', color: '#22c55e' },
  travel: { label: 'Flights & travel', emoji: '✈️', color: '#6366f1' },
  gifts: { label: 'Gifts', emoji: '🎁', color: '#d946ef' },
  other: { label: 'Other', emoji: '🧾', color: '#64748b' },
}

// First match wins, so the more specific lists come first (Swiggy Instamart → groceries before
// Swiggy → food; Uber Eats → food before Uber → transport; JioMart → groceries before Jio).
// Short words get \b so they don't fire inside others ("milkshake", "candy bar", "VISA POS").
const KEYWORDS: Array<[Category, RegExp]> = [
  ['groceries', /grocer|instamart|zepto|blinkit|grofers|big ?basket|bbnow|dmart|d-mart|jiomart|reliance (fresh|smart)|more (super|retail)|spencer|nature'?s basket|kirana|sabzi|vegetables|\bfruits?\b|\bmilk\b(?!shake)|dairy|woolworths|coles|aldi|\biga\b|supermarket|hypermarket|minimart|costco|(fish|vegetable|fruit|meat) market|big bazaar|\bmandi\b/i],
  // Home staff and household services (closest category: the monthly household bills).
  ['utilities', /\bmaids?\b|house ?help|\bcook\b(?!ies| book)|cook'?s salary|\blaundry\b|dry ?clean|\bdhobi\b|\bironing\b|\bistri\b|newspaper|paper ?wala|\bdriver salary/i],
  // A houseboat is somewhere to sleep, not a ride.
  ['stay', /houseboat|house boat/i],
  ['food', /food|dinner|lunch|breakfast|brunch|snacks?|cafe|café|coffee|chai|tea\b|restaurant|dhaba|thali|biryani|dosa|idli|chaat|pani ?puri|vada pav|samosa|momos|tiffin|canteen|mess\b|bakery|sweets|mithai|haldiram|barbeque|chaayos|starbucks|third wave|domino|pizza|burger|kfc|mcdonald|subway|beach shack|shack|milkshake|(?<!candy |chocolate |protein |granola |snack |soap )\bbar\b(?! ?(code|chart|graph))|\bpub\b|brewery|drinks|beer|toddy|liquor|\bwine\b|whisk(e)?y|vodka|\brum\b|daaru|daru\b|theka|thekka|\balcohol|swiggy|zomato|eatsure|uber ?eats|doordash|menulog|sushi/i],
  ['travel', /flight|airline|indigo|air india|vistara|spicejet|akasa|air asia|qantas|jetstar|virgin|irctc|railway|train ticket|tatkal|redbus|bus ticket|makemytrip|\bmmt\b|goibibo|cleartrip|ixigo|easemytrip|yatra|\be-?visa\b|\bvisa\b(?! ?(pos|card|debit|credit|signature|platinum|classic|infinite|txn|transaction))|passport|luggage|cruise/i],
  ['transport', /\bola\b|uber|rapido|\bauto\b|rickshaw|namma yatri|blu ?smart|taxi|\bcab\b|lyft|didi|metro|local train|petrol|diesel|fuel|\bcng\b|\biocl\b|indian oil|\bbpcl\b|bharat petroleum|\bhpcl\b|\bhp (petrol|pump|fuel)|fastag|toll|parking|scooty|scooter|bike (rental|hire)|zoomcar|car (hire|rental)|rental car|(?<!(?:hp|bharat|piped|indane) )\bgas\b(?! bill| cylinder| connection)|bus\b|opal|myki|ferry|\bboat\b|speedboat|\bjetty\b/i],
  ['stay', /hotel|\boyo\b|treebo|fabhotel|zostel|homestay|airbnb|hostel|motel|resort|booking\.com|agoda|accommodation|villa|guest ?house|lodge/i],
  ['entertainment', /movie|cinema|bookmyshow|\bbms\b|\bpvr\b|inox|cinepolis|^district\b|district (app|by zomato)|concert|ticket|netflix|hotstar|jiocinema|prime video|spotify|game|bowling|club|museum|tour|trek|scuba|parasailing|water ?sports|amusement|wonderla/i],
  ['shopping', /phone (case|cover)|mobile (case|cover)|screen guard|charger|boat (earphones|headphones|airdopes|rockerz)|flea market|night market|bazaar/i],
  ['utilities', /electric|electricity|bescom|msedcl|tneb|tata power|adani electricity|bses|cesc|power bill|\bpower\b|water bill|water|gas bill|gas cylinder|indane|\bhp gas|bharat gas|piped gas|internet|broadband|wifi|wi-fi|fibernet|act fibernet|hathway|\bjio\b|airtel|\bvi\b|vodafone|bsnl|recharge|dth|tata play|maintenance|society|\bnbn\b|\bphone\b|\bmobile\b|postpaid|prepaid|optus|telstra/i],
  ['rent', /rent\b|rent —|rent -|\bpg\b|paying guest|deposit|bond|lease/i],
  ['health', /pharmacy|chemist|medical|medicine|apollo|pharmeasy|\b1mg\b|netmeds|medplus|doctor|clinic|hospital|diagnostic|dentist|gym|cult\.?fit|yoga|salon|beauty parlou?r|haircut|hair ?cut|barber|\bspa\b|massage|manicure|pedicure/i],
  ['shopping', /flipkart|myntra|meesho|ajio|nykaa|croma|reliance digital|decathlon|lifestyle|westside|amazon|kmart|target|ikea|clothes|shopping|bunnings|\bmall\b/i],
  ['gifts', /gift|present\b|birthday|wedding|shagun/i],
  // Last, so a named place or brand wins ("Airport hotel", "Ola to airport").
  ['transport', /airport/i],
  // A tip on its own is usually the waiter's ("Taxi tip" is caught by transport above).
  ['food', /\btips?\b|gratuity/i],
]

export function guessCategory(description: string): Category | null {
  for (const [cat, re] of KEYWORDS) if (re.test(description)) return cat
  return null
}
