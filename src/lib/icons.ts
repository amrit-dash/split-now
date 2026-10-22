import type { Category, GroupType } from '@/types'
import { CATEGORIES } from './categories'
import { firstEmoji } from './emoji'

/*
 * The icon catalogue: emoji with the words that call for them. One table serves three jobs, all
 * without a network call: an expense's automatic icon (a more specific face than its category's:
 * "Pizza" shows 🍕, not 🍔), a group name's icon ("Ski trip" → 🎿), and the search in the icon
 * sheet. An expense's automatic icon only comes from entries of its own category, so the icon and
 * the category never disagree (a "Goa dinner" filed under Transport shows 🚕, not 🍽️).
 *
 * Each row: the emoji, its words ("|" between them, a phrase may have spaces), the categories it
 * fits (space-separated; none for a group-only icon), and the group type a name with that word
 * suggests (absent when it's not a group icon). Rows earlier in a section win a tie.
 */
type Row = [emoji: string, words: string, categories: string, group?: GroupType]

const ROWS: Row[] = [
  // Food and drink
  ['🍕', 'pizza|pizzas|dominos|domino|pizza hut|la pinoz', 'food', 'outing'],
  ['🍔', 'burger|burgers|mcdonalds|mcdonald|mcd|burger king|wendys|shake shack', 'food', 'outing'],
  ['🍗', 'kfc|chicken|wings|tandoori|tikka|kebab|kebabs|shawarma|grill', 'food'],
  ['☕', 'coffee|cafe|café|starbucks|third wave|blue tokai|cappuccino|latte|espresso|cold coffee|ccd|cafe coffee day', 'food', 'office'],
  ['🍵', 'chai|tea|chaayos|chai point|matcha', 'food'],
  ['🍺', 'beer|beers|brewery|pub|pubs|toddy|microbrewery|pint|pints', 'food', 'outing'],
  ['🍻', 'drinks|cheers|happy hour|pub crawl', 'food', 'outing'],
  ['🍷', 'wine|wines|vineyard|winery|sula', 'food', 'outing'],
  ['🍸', 'cocktail|cocktails|bar|lounge|mocktail|mocktails', 'food', 'outing'],
  ['🥃', 'whisky|whiskey|rum|vodka|gin|daaru|daru|liquor|alcohol|theka|booze|scotch', 'food'],
  ['🥂', 'champagne|prosecco|toast', 'food', 'couple'],
  ['🍛', 'biryani|curry|thali|dal|rice|meals|meal|rajma|chole|butter chicken|north indian|south indian', 'food', 'outing'],
  ['🫓', 'dosa|idli|vada|uttapam|paratha|parathas|roti|naan|kulcha|poori|puri bhaji', 'food'],
  ['🥘', 'dhaba|paneer|sabji|pav bhaji|misal', 'food'],
  ['🍜', 'noodles|ramen|maggi|pho|chinese|hakka|chowmein|thukpa|asian', 'food'],
  ['🥟', 'momos|momo|dumplings|dimsum|dim sum|gyoza', 'food'],
  ['🍣', 'sushi|japanese', 'food'],
  ['🌮', 'tacos|taco|mexican|burrito|burritos|nachos|taco bell', 'food'],
  ['🥗', 'salad|salads|healthy|bowl|poke', 'food'],
  ['🍝', 'pasta|italian|spaghetti|lasagna', 'food'],
  ['🍟', 'fries|snacks|snack|chips|samosa|samosas|vada pav|pani puri|panipuri|golgappa|chaat|street food|bhel|kachori', 'food'],
  ['🍱', 'lunch|tiffin|bento|lunch box|canteen|mess|cafeteria|dabba', 'food', 'office'],
  ['🍽️', 'dinner|dinners|restaurant|dining|dine|buffet|fine dining|feast', 'food', 'outing'],
  ['🥐', 'croissant|breakfast|brunch|bakery|bakeries', 'food', 'outing'],
  ['🍳', 'eggs|omelette|omelet|english breakfast', 'food'],
  ['🥞', 'pancakes|pancake|waffles|waffle', 'food'],
  ['🍦', 'ice cream|icecream|gelato|baskin robbins|naturals|kulfi|frozen yogurt|sundae', 'food'],
  ['🍰', 'cake|cakes|pastry|pastries|dessert|desserts|brownie|brownies|cheesecake|cupcakes', 'food gifts'],
  ['🍩', 'donut|donuts|doughnut|doughnuts|krispy kreme', 'food'],
  ['🍫', 'chocolate|chocolates|sweets|mithai|haldiram|haldirams|ladoo|barfi|gulab jamun|jalebi', 'food gifts'],
  ['🥤', 'juice|juices|shake|shakes|milkshake|smoothie|soda|cold drink|cold drinks|coke|pepsi|sprite|lassi|nimbu pani', 'food'],
  ['🧋', 'bubble tea|boba', 'food'],
  ['🍿', 'popcorn|movie snacks', 'food entertainment'],
  ['🥡', 'takeaway|takeout|swiggy|zomato|eatsure|uber eats|doordash|menulog|food delivery|parcel food', 'food'],
  ['🌭', 'hot dog|hotdog|sandwich|sandwiches|subway|wrap|wraps|roll|rolls|frankie', 'food'],
  // Groceries and the house
  [
    '🛒',
    'grocery|groceries|supermarket|hypermarket|dmart|d mart|bigbasket|big basket|zepto|blinkit|instamart|jiomart|kirana|woolworths|coles|aldi|costco|nature basket|ration',
    'groceries',
  ],
  ['🥦', 'vegetables|veggies|vegetable|sabzi|greens|veg', 'groceries'],
  ['🍎', 'fruits|fruit|apples|bananas|oranges|grapes', 'groceries'],
  ['🥭', 'mango|mangoes|mangos', 'groceries food'],
  ['🥛', 'milk|dairy|curd|dahi|yogurt|butter|cheese|amul|country delight', 'groceries'],
  ['🍞', 'bread|loaf|buns', 'groceries'],
  ['🥚', 'eggs|egg tray', 'groceries'],
  ['🥩', 'meat|mutton|beef|pork|butcher|licious|chicken breast', 'groceries'],
  ['🐟', 'fish|seafood|prawns|prawn|crab|fish market', 'groceries food'],
  ['🧂', 'masala|spices|salt|oil|atta|flour|sugar|pulses|rice bag', 'groceries'],
  ['🧻', 'toilet paper|tissues|tissue|napkins|kitchen towel', 'groceries shopping'],
  ['🧴', 'shampoo|soap|lotion|sunscreen|toiletries|body wash|conditioner|toothpaste', 'groceries shopping health'],
  ['🧽', 'detergent|dishwash|cleaning supplies|surf excel|vim|harpic|lizol', 'groceries utilities'],
  ['🍼', 'baby|diapers|diaper|formula|pampers', 'groceries shopping health', 'family'],
  ['🐶', 'dog|dogs|puppy|pet|pets|pet food|dog food|pedigree|drools|supertails', 'pets groceries shopping health other', 'other'],
  ['🐱', 'cat|cats|kitten|cat food|cat litter|whiskas', 'pets groceries shopping health other'],
  // Getting around
  ['🚕', 'taxi|cab|cabs|uber|ola|lyft|didi|blusmart|meru|airport cab|airport taxi|airport transfer', 'transport'],
  ['🛺', 'auto|autos|rickshaw|tuktuk|tuk tuk|e rickshaw|namma yatri', 'transport'],
  ['🏍️', 'rapido|motorbike|scooty|scooter|bike rental|bike hire|royal enfield|bullet|activa', 'transport', 'trip'],
  ['🚗', 'car|car rental|car hire|rental car|zoomcar|self drive|drive|road trip|roadtrip|road trips|revv|carpool', 'transport', 'trip'],
  ['🚐', 'tempo traveller|tempo|van|minibus|innova|traveller', 'transport', 'trip'],
  ['⛽', 'petrol|diesel|fuel|cng|gas station|petrol pump|indian oil|iocl|hpcl|bpcl|shell|ev charging|charging', 'transport'],
  ['🅿️', 'parking|valet|parking fee', 'transport'],
  ['🛣️', 'toll|tolls|fastag|highway|expressway|toll plaza', 'transport'],
  ['🚇', 'metro|subway train|underground|tube|metro card|namma metro', 'transport'],
  ['🚌', 'bus|buses|volvo|redbus|shuttle bus|bus ticket|bus tickets|sleeper bus|ksrtc|msrtc|bus pass|opal|myki', 'transport travel', 'trip'],
  ['🚆', 'train|trains|railway|railways|irctc|rail|local train|tatkal|sleeper class|vande bharat|rajdhani|shatabdi|eurail', 'travel transport', 'trip'],
  ['⛴️', 'ferry|ferries|jetty|ro ro', 'transport travel'],
  ['🛳️', 'cruise|cruises|cordelia|sunset cruise', 'travel entertainment', 'trip'],
  ['🚤', 'boat|boats|speedboat|boat ride|shikara|motorboat', 'transport entertainment'],
  ['🛶', 'kayak|kayaking|canoe|canoeing|rafting|river rafting|backwaters', 'entertainment', 'trip'],
  ['⛵', 'sailing|yacht|yachts|catamaran', 'entertainment', 'trip'],
  ['🚲', 'cycle|cycles|bicycle|cycling|bike ride|yulu', 'transport entertainment health', 'sports'],
  ['🔧', 'repair|repairs|mechanic|car wash|puncture|car service|bike service|servicing|plumber|electrician|carpenter|handyman', 'transport utilities rent'],
  ['🚚', 'moving|packers|movers|shifting|packers and movers|truck|porter', 'rent transport other'],
  // Travel
  [
    '✈️',
    'flight|flights|airline|airlines|indigo|air india|vistara|spicejet|akasa|airfare|plane|plane tickets|air ticket|air tickets|qantas|jetstar|emirates',
    'travel',
    'trip',
  ],
  ['🧳', 'luggage|baggage|excess baggage|suitcase|suitcases|trolley bag|packing', 'travel shopping', 'trip'],
  ['🛂', 'visa|visas|passport|passports|immigration|evisa|e visa|visa fee', 'travel'],
  ['🗺️', 'tour|tours|guide|tour guide|sightseeing|itinerary|city tour|walking tour', 'entertainment travel', 'trip'],
  ['🚁', 'helicopter|heli|chopper', 'travel entertainment'],
  ['🌏', 'world tour|abroad|international|backpacking|euro trip|europe trip|world', 'travel', 'trip'],
  ['🏖️', 'beach|beaches|shack|beach shack|goa|gokarna|varkala|alibaug|pondicherry|puducherry|kovalam|digha|puri beach', 'entertainment travel', 'trip'],
  ['🏝️', 'island|islands|maldives|bali|phuket|andaman|andamans|lakshadweep|havelock|langkawi|koh samui', 'travel stay', 'trip'],
  [
    '🏔️',
    'mountain|mountains|hills|manali|ladakh|leh|shimla|spiti|kasol|himachal|kashmir|mussoorie|munnar|ooty|darjeeling|sikkim|nainital|himalaya|himalayas|uttarakhand|meghalaya',
    'travel',
    'trip',
  ],
  ['🎿', 'ski|skiing|snowboard|snowboarding|gulmarg|auli|ski pass', 'entertainment travel', 'trip'],
  ['❄️', 'snow|winter|winters|snowfall', 'travel', 'trip'],
  ['🏜️', 'rajasthan|jaisalmer|desert|jaipur|udaipur|jodhpur|camel|camel ride|dune|dunes|desert safari', 'travel entertainment', 'trip'],
  ['🌴', 'kerala|coorg|tropical|palm|wayanad|chikmagalur|plantation', 'travel', 'trip'],
  ['🏞️', 'lake|lakes|waterfall|waterfalls|valley|nature|national park|countryside|picnic', 'travel entertainment', 'trip'],
  ['🦁', 'zoo|safari|jungle safari|wildlife|tiger reserve|jim corbett|ranthambore|kabini|bandipur', 'entertainment travel', 'trip'],
  [
    '🛕',
    'temple|temples|darshan|puja|pooja|prasad|pilgrimage|varanasi|tirupati|haridwar|rishikesh|kedarnath|badrinath|char dham|vaishno devi|shirdi|amritsar|golden temple',
    'other gifts travel',
    'trip',
  ],
  ['🏙️', 'city|city trip|singapore|dubai|hong kong|mumbai trip|delhi trip|bangkok|kuala lumpur', 'travel', 'trip'],
  ['🗼', 'paris|france|europe|london|rome|italy|spain|switzerland|amsterdam', 'travel', 'trip'],
  ['🏯', 'japan|tokyo|kyoto|osaka|china|korea|seoul', 'travel', 'trip'],
  ['🗽', 'new york|nyc|usa|america|us trip|california|vegas|las vegas', 'travel', 'trip'],
  ['🦘', 'australia|sydney|melbourne|new zealand|nz', 'travel', 'trip'],
  ['🌧️', 'monsoon|rain|rainy', 'travel', 'trip'],
  // Somewhere to stay
  ['🏨', 'hotel|hotels|oyo|treebo|fabhotel|motel|inn|stay|booking com|agoda|marriott|taj|itc|hyatt|accommodation|room booking', 'stay'],
  ['🏡', 'homestay|homestays|airbnb|villa|villas|cottage|cottages|bnb|guest house|guesthouse|farmhouse|farm stay', 'stay', 'trip'],
  ['🛏️', 'hostel|hostels|zostel|dorm|dorms|bed|beds|room|rooms|lodge|backpacker hostel', 'stay'],
  ['🏕️', 'camp|camps|camping|tent|tents|glamping|campsite|bonfire|campfire', 'stay entertainment', 'trip'],
  ['🛖', 'hut|huts|cabin|cabins|treehouse|tree house|houseboat|house boat', 'stay', 'trip'],
  ['🏰', 'resort|resorts|club mahindra|palace stay|heritage hotel', 'stay', 'trip'],
  // Going out and things to do
  ['🎬', 'movie|movies|cinema|film|films|pvr|inox|cinepolis|bookmyshow|imax|movie night|movie tickets', 'entertainment', 'outing'],
  ['🎟️', 'ticket|tickets|entry|entry fee|entry tickets|admission|cover charge|pass|passes', 'entertainment'],
  ['🎵', 'concert|concerts|gig|gigs|music|festival|fest|live music|sunburn|lollapalooza|nh7|music festival|edm|coldplay', 'entertainment', 'event'],
  ['🎤', 'karaoke|standup|stand up|comedy|comedy show|open mic|show tickets', 'entertainment', 'outing'],
  ['🎭', 'theatre|theater|play|drama|musical|ballet|opera|ranga shankara', 'entertainment', 'event'],
  ['🎳', 'bowling|bowling alley', 'entertainment', 'outing'],
  ['🎮', 'gaming|game|games|arcade|playstation|ps5|xbox|steam|smaaash|timezone|lan party|vr', 'entertainment', 'other'],
  ['🎲', 'board games|board game|boardgame|boardgames|casino|poker|cards|ludo', 'entertainment', 'outing'],
  ['🧩', 'escape room|puzzle|quiz|trivia|quiz night', 'entertainment', 'outing'],
  ['🏏', 'cricket|ipl|turf|box cricket|nets', 'entertainment health', 'sports'],
  ['⚽', 'football|futsal|soccer|fifa|five a side', 'entertainment health', 'sports'],
  ['🏸', 'badminton|shuttlecock|shuttles', 'entertainment health', 'sports'],
  ['🎾', 'tennis|pickleball|squash|padel|table tennis', 'entertainment health', 'sports'],
  ['🏀', 'basketball|volleyball|throwball', 'entertainment health', 'sports'],
  ['⛳', 'golf|mini golf|driving range', 'entertainment health', 'sports'],
  ['🏊', 'swimming|swim|pool|swimming pool|aqua', 'entertainment health'],
  ['🧗', 'climbing|bouldering|rock climbing|rappelling', 'entertainment', 'trip'],
  ['🥾', 'trek|treks|trekking|hike|hikes|hiking|trail|trails|kedarkantha|hampta', 'entertainment travel', 'trip'],
  ['🤿', 'scuba|scuba diving|snorkel|snorkeling|snorkelling|diving|dive|dives', 'entertainment', 'trip'],
  ['🪂', 'paragliding|parasailing|skydiving|bungee|bungee jumping|zipline|zip line|adventure', 'entertainment', 'trip'],
  ['🏄', 'surfing|surf|water sports|watersports|jet ski|jetski|banana ride|wakeboarding', 'entertainment', 'trip'],
  ['🎡', 'amusement park|wonderla|imagica|theme park|fair|carnival|water park|waterpark|disneyland|universal studios', 'entertainment', 'outing'],
  ['🏛️', 'museum|museums|monument|monuments|fort|forts|palace|heritage|gallery|exhibition', 'entertainment travel'],
  ['🏟️', 'match|stadium|ipl match|world cup|cricket match|football match|f1|grand prix', 'entertainment', 'event'],
  ['🎨', 'art|painting|workshop|pottery|craft|crafts|art class|sip and paint', 'entertainment shopping', 'other'],
  ['📸', 'photo|photos|photographer|photography|photoshoot|photo shoot|prints|polaroid', 'entertainment shopping'],
  ['💃', 'club|clubbing|dance|dancing|nightclub|night club|salsa|garba', 'entertainment', 'outing'],
  ['🎉', 'party|parties|celebration|celebrations|celebrate|housewarming|house warming|get together|reunion', 'entertainment food', 'event'],
  [
    '📺',
    'netflix|hotstar|prime video|jiocinema|jiohotstar|youtube premium|disney|ott|subscription|subscriptions|sonyliv|zee5',
    'subscriptions entertainment utilities',
  ],
  [
    '🎧',
    'spotify|apple music|music subscription|youtube music|headphones|earphones|airpods|earbuds|speaker|boat airdopes',
    'subscriptions entertainment shopping',
  ],
  ['☁️', 'icloud|google one|cloud storage|dropbox|chatgpt|chatgpt plus|apple one|renewal|auto renewal|membership renewal', 'subscriptions'],
  ['📚', 'books|book|kindle|novel|novels|bookstore|book store|crossword|comics|textbook|textbooks', 'shopping entertainment education'],
  [
    '🎓',
    'college|university|school|fees|school fees|tuition|course|courses|class|classes|exam|exams|graduation|convocation|alumni|batch|batchmates|hostel mates|udemy|coursera|coaching',
    'education other',
    'other',
  ],
  // Shopping
  ['🛍️', 'shopping|mall|malls|myntra|ajio|lifestyle|westside|zara|h and m|uniqlo|max fashion|pantaloons|shoppers stop|haul', 'shopping'],
  ['👕', 'clothes|tshirt|tshirts|t shirt|t shirts|shirt|shirts|jeans|kurta|kurtas|clothing|hoodie|jacket|trousers', 'shopping gifts'],
  ['👟', 'shoes|sneakers|footwear|nike|adidas|puma|bata|sandals|slippers|chappals|crocs', 'shopping'],
  ['👗', 'dress|dresses|saree|sarees|sari|lehenga|lehengas|gown|ethnic wear', 'shopping gifts'],
  ['💍', 'ring|rings|jewellery|jewelry|gold|tanishq|necklace|earrings', 'shopping gifts'],
  ['⌚', 'watch|watches|smartwatch|smart watch|fitbit', 'shopping gifts'],
  ['🕶️', 'sunglasses|shades|ray ban', 'shopping'],
  ['🎒', 'bag|bags|backpack|backpacks|handbag|wallet|purse', 'shopping gifts'],
  ['💄', 'makeup|cosmetics|lipstick|nykaa|skincare|skin care|perfume|deo|deodorant', 'shopping health gifts'],
  [
    '📱',
    'phone|phones|mobile|iphone|smartphone|phone case|phone cover|screen guard|charger|recharge|mobile recharge|postpaid|prepaid|phone bill|mobile bill|jio|airtel|vodafone|vi|bsnl|telstra|optus',
    'shopping utilities',
  ],
  ['💻', 'laptop|laptops|computer|macbook|keyboard|mouse|monitor|ipad|tablet|software|app store|play store', 'shopping education subscriptions'],
  [
    '🔌',
    'appliance|appliances|electronics|croma|reliance digital|fridge|washing machine|microwave|mixer|iron|vacuum|geyser|air purifier',
    'shopping utilities',
  ],
  ['🔋', 'battery|batteries|power bank|powerbank|cable|cables|adapter', 'shopping'],
  ['🧸', 'toys|toy|kids|lego|games for kids|soft toy', 'shopping gifts'],
  ['🎽', 'decathlon|sportswear|sports gear|jersey|jerseys|gym wear|sports shoes', 'shopping', 'sports'],
  ['🪑', 'furniture|ikea|chair|chairs|table|sofa|bed frame|mattress|pepperfry|urban ladder|wakefit|curtains|decor|home decor', 'shopping rent', 'home'],
  ['🍳', 'kitchen|utensils|cookware|pans|pots|plates|crockery', 'shopping', 'home'],
  ['🪴', 'plants|plant|nursery|garden|gardening|pots and plants|seeds', 'shopping', 'home'],
  ['✏️', 'stationery|pens|pen|notebook|notebooks|printing|print|prints out|xerox|photocopy', 'shopping education other'],
  ['📦', 'amazon|flipkart|meesho|order|online order|delivery|courier|parcel|shipping|blue dart|dtdc', 'shopping other'],
  // Bills and the home
  [
    '💡',
    'electricity|electric|power|bescom|tneb|msedcl|tata power|adani electricity|bses|cesc|power bill|light bill|electricity bill|current bill',
    'utilities',
  ],
  ['🚰', 'water|water bill|water can|water cans|bisleri|drinking water|water tanker|tanker', 'utilities'],
  ['🔥', 'gas|gas bill|cylinder|gas cylinder|lpg|indane|bharat gas|hp gas|piped gas|igl|mgl', 'utilities'],
  ['🌐', 'internet|wifi|wi fi|broadband|fibernet|act fibernet|airtel fiber|airtel xstream|jiofiber|jio fiber|hathway|nbn|data pack', 'utilities'],
  ['📡', 'dth|tata play|tata sky|dish tv|cable tv|d2h|sun direct', 'utilities'],
  ['🧹', 'maid|maids|house help|househelp|cleaning|cleaner|bai|deep cleaning|urban company|pest control', 'utilities'],
  ['🧑‍🍳', 'cook|cooks|cook salary|chef|cooking', 'utilities food'],
  ['🧺', 'laundry|dhobi|dry clean|dry cleaning|ironing|istri|wash and fold', 'utilities'],
  ['🏢', 'society|maintenance|society maintenance|maintenance charges|association|apartment maintenance|security guard|lift', 'utilities rent', 'office'],
  ['🗑️', 'garbage|trash|waste|garbage collection', 'utilities'],
  ['📰', 'newspaper|newspapers|paper wala|magazine|magazines', 'utilities'],
  ['🏠', 'rent|house rent|flat rent|room rent|apartment|flat|pg|paying guest|lease|home|house|flatmates|roommates|roommate|roomies|flatmate', 'rent', 'home'],
  ['🔑', 'deposit|security deposit|bond|advance|brokerage|broker|token amount|keys|key|locksmith', 'rent'],
  // Health and looking after yourself
  ['💊', 'medicine|medicines|pharmacy|chemist|apollo pharmacy|pharmeasy|1mg|netmeds|medplus|tablets|meds|vitamins|supplements', 'health'],
  ['🩺', 'doctor|doctors|clinic|consultation|checkup|check up|health check|gp|physician|practo|opd', 'health'],
  ['🏥', 'hospital|hospitals|emergency|surgery|admission|er|icu', 'health'],
  ['🦷', 'dentist|dental|teeth|tooth|braces|root canal', 'health'],
  ['🧪', 'lab|labs|lab test|blood test|diagnostic|diagnostics|thyrocare|pathology|xray|x ray|mri|ct scan|ultrasound', 'health'],
  ['👓', 'glasses|spectacles|lenses|contact lenses|lenskart|optician|eye test|eye checkup', 'health shopping'],
  ['💇', 'haircut|hair cut|salon|barber|hair|hairdresser|hair colour|hair color|hair spa|trim|beard', 'health'],
  ['💅', 'manicure|pedicure|nails|nail art|beauty parlour|beauty parlor|parlour|parlor|facial|waxing|threading|beauty', 'health'],
  ['💆', 'spa|massage|massages|ayurveda|ayurvedic|wellness', 'health'],
  ['🏋️', 'gym|gyms|cult|cultfit|cult fit|workout|fitness|crossfit|personal trainer|trainer|membership', 'health', 'sports'],
  ['🧘', 'yoga|meditation|pilates|retreat|yoga retreat', 'health', 'trip'],
  ['🏃', 'marathon|run|running|race|10k|half marathon|triathlon', 'health entertainment', 'event'],
  ['🐾', 'vet|vets|veterinary|grooming|pet grooming|pet care|dog walker|boarding|kennel', 'pets health other'],
  ['🛡️', 'insurance|policy|premium|lic|health insurance|car insurance|travel insurance', 'health other'],
  // Gifts and occasions
  ['🎁', 'gift|gifts|present|presents|shagun|return gift|return gifts|gift card|hamper|secret santa', 'gifts'],
  ['💐', 'flowers|flower|bouquet|bouquets|florist|roses', 'gifts'],
  ['🎂', 'birthday|birthdays|bday|birthday cake|birthday party|bday party', 'gifts food', 'event'],
  ['💒', 'wedding|weddings|engagement|sangeet|mehendi|mehndi|haldi|reception|shaadi|marriage|cocktail party|roka', 'gifts', 'event'],
  [
    '🥳',
    'bachelor|bachelors|bachelorette|bachelor party|bachelorette party|farewell|send off|sendoff|baby shower|graduation party',
    'gifts entertainment',
    'event',
  ],
  ['💝', 'anniversary|valentine|valentines|date night|date|honeymoon|proposal', 'gifts food', 'couple'],
  ['❤️', 'love|us two|us|couple|together|babe|bae', '', 'couple'],
  ['🪔', 'diwali|deepavali|navratri|durga puja|ganesh chaturthi|onam|pongal|eid|rakhi|raksha bandhan|festival shopping', 'gifts', 'event'],
  ['🌈', 'holi|colours|colors|pride', 'gifts entertainment', 'event'],
  ['🎄', 'christmas|xmas|new year|new years|nye', 'gifts entertainment', 'event'],
  ['🎃', 'halloween|costume|costumes', 'entertainment shopping', 'event'],
  ['👪', 'family|parents|mom|mum|dad|kids|cousins|in laws|relatives|grandparents', 'other', 'family'],
  // Work and money matters
  [
    '💼',
    'office|team|work|colleagues|business|client|clients|meeting|conference|work trip|offsite|off site|team outing|team lunch|team dinner|startup',
    'other',
    'office',
  ],
  ['🖥️', 'coworking|co working|wework|desk|cowork', 'other rent', 'office'],
  ['🏦', 'bank|atm|cash|cash withdrawal|withdrawal|bank charges|charges|interest', 'other'],
  ['💳', 'credit card|card fee|annual fee|emi|emis|loan emi|card bill', 'other'],
  ['💸', 'transfer|loan|lent|borrowed|money|pocket money|tip|tips|gratuity|donation|donations|charity', 'other food'],
  ['🏛️', 'tax|taxes|govt|government|fine|fines|challan|traffic fine|stamp duty|registration|rto|license|licence|passport fee', 'other'],
  ['📮', 'post|postage|speed post|stamps|post office', 'other'],
]

export interface IconEntry {
  emoji: string
  /** each word or phrase, split into its words */
  words: string[][]
  categories: Category[]
  group?: GroupType
}

const tokens = (s: string): string[] =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

export const ICONS: IconEntry[] = ROWS.map(([emoji, words, cats, group]) => ({
  emoji,
  words: words.split('|').map(tokens),
  categories: cats.split(' ').filter(Boolean) as Category[],
  ...(group ? { group } : {}),
}))

/** A word in text matches a catalogue word, its plural ("pizzas", "buses") counting too. */
const same = (t: string, w: string) => t === w || t === `${w}s` || t === `${w}es`

/** How many words of `text` the phrase covers where it appears in it (0: it doesn't). */
function phraseAt(text: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= text.length; i++) if (phrase.every((w, j) => same(text[i + j], w))) return phrase.length
  return 0
}

/**
 * The entry that best fits the text: the longest phrase found wins ("ice cream" over "cream",
 * "gas station" over "gas"), then the earlier row. `ok` narrows which entries may answer.
 */
export function bestIcon(text: string, ok: (e: IconEntry) => boolean = () => true): IconEntry | null {
  const t = tokens(text)
  if (!t.length) return null
  let best: IconEntry | null = null
  let bestLen = 0
  for (const e of ICONS) {
    if (!ok(e)) continue
    for (const p of e.words) {
      const n = phraseAt(t, p)
      if (n > bestLen) {
        best = e
        bestLen = n
      }
    }
  }
  return best
}

/**
 * The automatic icon for an expense with this description: from its own category's entries, or
 * from any entry while the category is still "Other". Null when no word fits (the category's emoji).
 */
export function guessExpenseIcon(description: string, category: Category): string | null {
  return bestIcon(description, (e) => category === 'other' || e.categories.includes(category))?.emoji ?? null
}

/** A stored icon is one emoji; anything else (a locked private group's token, junk) is ignored. */
export const isIcon = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16 && firstEmoji(v) === v

/** The face an expense shows: the icon someone chose, else the automatic one, else its category's. */
export function expenseEmoji(e: { icon?: string; description: string; category: Category }): string {
  if (isIcon(e.icon)) return e.icon
  const cat = CATEGORIES[e.category] ?? CATEGORIES.other
  return guessExpenseIcon(e.description, e.category in CATEGORIES ? e.category : 'other') ?? cat.emoji
}

/** A group name's icon and the type it suggests, from the group rows ("Ski trip" → 🎿 trip). */
export function guessGroupIcon(name: string): { emoji: string; type: GroupType } | null {
  const e = bestIcon(name, (x) => !!x.group)
  return e?.group ? { emoji: e.emoji, type: e.group } : null
}

/** Every icon a group may pick, each once, in catalogue order. */
export const GROUP_ICON_LIST: string[] = [...new Set(ICONS.filter((e) => e.group).map((e) => e.emoji))]

/**
 * The icon sheet's search: entries whose words start with every word typed ("ice" finds 🍦,
 * "fer" finds ⛴️), best first: a whole-word match before a prefix. Empty finds everything.
 * `first` lists icons to put up front when the search is empty (a category's own, a group type's).
 */
export function searchIcons(query: string, first: string[] = []): string[] {
  const q = tokens(query)
  const all = [...new Set([...first, ...ICONS.map((e) => e.emoji)])]
  if (!q.length) return all
  const exact: string[] = []
  const prefix: string[] = []
  for (const e of ICONS) {
    const flat = e.words.flat()
    if (!q.every((w) => flat.some((x) => x.startsWith(w)))) continue
    ;(q.every((w) => flat.some((x) => same(w, x) || same(x, w))) ? exact : prefix).push(e.emoji)
  }
  return [...new Set([...exact, ...prefix])]
}

/** A category's own icons, for the top of the sheet: its emoji, then its catalogue rows. */
export const categoryIcons = (c: Category): string[] => [
  ...new Set([CATEGORIES[c]?.emoji ?? CATEGORIES.other.emoji, ...ICONS.filter((e) => e.categories.includes(c)).map((e) => e.emoji)]),
]
