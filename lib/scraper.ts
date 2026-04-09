import * as cheerio from "cheerio";

// ── Types ────────────────────────────────────────────────────────────────

export interface Listing {
  source: string;
  title: string;
  price: number | null;
  pricePerPerson: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  neighborhood: string;
  address: string;
  sqft: number | null;
  zipCode: string;
  url: string;
  commuteTransit: number | null;
  commuteBike: number | null;
  transitRoute: string;
  mapsUrl: string;
  availability: string;  // "Available Now", "Available 5/1", "Open House 4/12", etc.
}

export interface SearchLink {
  site: string;
  neighborhood: string;
  url: string;
}

// ── Config ───────────────────────────────────────────────────────────────

const TARGET_NEIGHBORHOODS = [
  "nob hill", "japantown", "japan town", "mission",
  "duboce triangle", "duboce",
];

const MIN_PRICE = 4000;
const MAX_PRICE = 12000;
const MIN_BEDS = 3;
const MAX_BEDS = 4;
const MIN_BATHS = 2;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// LinkedIn SF Office: 222 2nd St
const COMMUTE_BY_ZIP: Record<string, { transit: number; bike: number; route: string; hood: string }> = {
  "94102": { transit: 15, bike: 12, hood: "SoMa/Civic Center",      route: "Muni F/6/7 or walk" },
  "94103": { transit: 12, bike: 10, hood: "SoMa/South of Market",   route: "Muni 14/49 or BART 16th→Montgomery" },
  "94107": { transit: 15, bike: 12, hood: "SoMa/Potrero",           route: "Muni T-Third or 22" },
  "94108": { transit: 12, bike: 10, hood: "Chinatown/FiDi",         route: "Muni 1/8 or walk" },
  "94109": { transit: 18, bike: 15, hood: "Nob Hill/Polk Gulch",    route: "Cable Car or Muni 1/19" },
  "94110": { transit: 15, bike: 15, hood: "Mission",                route: "BART 16th/24th→Montgomery" },
  "94114": { transit: 22, bike: 18, hood: "Castro/Noe Valley",      route: "Muni J/K→Market or BART Castro" },
  "94115": { transit: 22, bike: 18, hood: "Japantown/W. Addition",  route: "Muni 38-Geary→transfer or 22" },
  "94117": { transit: 22, bike: 18, hood: "Haight/Duboce Triangle", route: "Muni N-Judah→Montgomery BART" },
  "94118": { transit: 28, bike: 22, hood: "Inner Richmond",         route: "Muni 38-Geary→transfer" },
  "94121": { transit: 35, bike: 30, hood: "Outer Richmond",         route: "Muni 38-Geary (long ride)" },
  "94122": { transit: 35, bike: 28, hood: "Sunset",                 route: "Muni N-Judah→Montgomery" },
  "94112": { transit: 30, bike: 28, hood: "Ingleside",              route: "BART Balboa Park→Montgomery" },
  "94116": { transit: 32, bike: 28, hood: "Parkside",               route: "Muni L→transfer" },
  "94124": { transit: 30, bike: 22, hood: "Bayview",                route: "Muni T-Third" },
  "94131": { transit: 25, bike: 20, hood: "Glen Park/Twin Peaks",   route: "BART Glen Park→Montgomery" },
  "94133": { transit: 15, bike: 12, hood: "North Beach/Telegraph",  route: "Muni 8X/30/45 or walk" },
  "94134": { transit: 30, bike: 25, hood: "Visitacion Valley",      route: "Muni T-Third or BART" },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "").replace(/\s/g, "");
  const matches = cleaned.match(/\d+/g);
  if (!matches) return null;
  for (const m of matches) {
    const val = parseInt(m, 10);
    if (val >= 1000 && val <= 20000) return val;
  }
  return null;
}

function parseHousingInfo(text: string): { beds: number | null; baths: number | null; sqft: number | null } {
  const bedMatch = text.match(/(\d+)\s*(?:br|bed|bd)/i);
  const bathMatch = text.match(/(\d+\.?\d*)\s*(?:ba|bath)/i);
  const sqftMatch = text.match(/([\d,]+)\s*(?:ft|sq)/i);
  return {
    beds: bedMatch ? parseInt(bedMatch[1], 10) : null,
    baths: bathMatch ? parseFloat(bathMatch[1]) : null,
    sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, ""), 10) : null,
  };
}

function extractZip(text: string): string {
  const match = text.match(/9\d{4}/);
  return match ? match[0] : "";
}

function enrichListing(l: Listing): Listing {
  if (l.price && l.bedrooms) {
    l.pricePerPerson = Math.floor(l.price / l.bedrooms);
  }
  l.zipCode = extractZip(`${l.title} ${l.address}`);
  const commute = COMMUTE_BY_ZIP[l.zipCode];
  if (commute) {
    l.commuteTransit = commute.transit;
    l.commuteBike = commute.bike;
    l.transitRoute = commute.route;
    // Fix neighborhood from zip code — more accurate than Zillow's search page assignment
    l.neighborhood = commute.hood;
  }
  const addr = encodeURIComponent(l.address || l.title);
  const dest = encodeURIComponent("222 2nd St, San Francisco, CA 94105");
  l.mapsUrl = `https://www.google.com/maps/dir/${addr}/${dest}/`;
  return l;
}

function inTargetNeighborhood(l: Listing): boolean {
  const text = `${l.title} ${l.neighborhood} ${l.address}`.toLowerCase();
  return TARGET_NEIGHBORHOODS.some((n) => text.includes(n));
}

function passesFilters(l: Listing): boolean {
  if (l.bedrooms && l.bedrooms !== 3 && l.bedrooms !== 4) return false;
  if (l.bathrooms && l.bathrooms < MIN_BATHS) return false;
  if (!inTargetNeighborhood(l)) return false;
  const best = Math.min(l.commuteTransit ?? 999, l.commuteBike ?? 999);
  if (best !== 999 && best > 30) return false;
  return true;
}

function bestCommute(l: Listing): number {
  return Math.min(l.commuteTransit ?? 999, l.commuteBike ?? 999);
}

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ── Zillow Scraper ───────────────────────────────────────────────────────

interface ZillowResult {
  zpid?: string;
  price?: number | string;
  unformattedPrice?: number;
  beds?: number;
  bedrooms?: number;
  baths?: number;
  bathrooms?: number;
  address?: string | { streetAddress?: string; city?: string };
  detailUrl?: string;
  hdpUrl?: string;
  area?: number;
  livingArea?: number;
  statusText?: string;
  // Availability fields
  availabilityDate?: string;
  dateAvailable?: string;
  moveInDate?: string;
  availableNow?: boolean;
  openHouse?: string;
  openHouseSchedule?: unknown[];
  daysOnZillow?: number;
  timeOnZillow?: string;
  listingDateTimeOnZillow?: string;
  [key: string]: unknown;
}

function extractZillowResults(data: unknown, results: ZillowResult[] = []): ZillowResult[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if ("zpid" in obj || ("price" in obj && "address" in obj)) {
      results.push(obj as ZillowResult);
    }
    if ("listResults" in obj && Array.isArray(obj.listResults)) {
      for (const item of obj.listResults) results.push(item as ZillowResult);
    }
    const sr = obj.searchResults as Record<string, unknown> | undefined;
    if (sr && "listResults" in sr && Array.isArray(sr.listResults)) {
      for (const item of sr.listResults) results.push(item as ZillowResult);
    }
    for (const v of Object.values(obj)) {
      extractZillowResults(v, results);
    }
  } else if (Array.isArray(data)) {
    for (const item of data) extractZillowResults(item, results);
  }
  return results;
}

function zillowResultToListing(data: ZillowResult, hood: string): Listing | null {
  const rawPrice = data.price ?? data.unformattedPrice;
  const price = typeof rawPrice === "string" ? parsePrice(rawPrice) : typeof rawPrice === "number" ? Math.round(rawPrice) : null;
  if (!price) return null;

  const beds = (data.beds ?? data.bedrooms) as number | undefined;
  const baths = (data.baths ?? data.bathrooms) as number | undefined;

  let address = "";
  if (typeof data.address === "object" && data.address) {
    address = `${data.address.streetAddress || ""}, ${data.address.city || ""}`;
  } else if (typeof data.address === "string") {
    address = data.address;
  }

  let detailUrl = (data.detailUrl || data.hdpUrl || "") as string;
  if (detailUrl && !detailUrl.startsWith("http")) {
    detailUrl = `https://www.zillow.com${detailUrl}`;
  }

  // Extract availability info
  let availability = "";
  if (data.availableNow) {
    availability = "Available Now";
  } else if (data.availabilityDate || data.dateAvailable || data.moveInDate) {
    const dateStr = (data.availabilityDate || data.dateAvailable || data.moveInDate) as string;
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        availability = `Available ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        availability = `Available ${dateStr}`;
      }
    } catch {
      availability = `Available ${dateStr}`;
    }
  }
  if (data.openHouseSchedule && Array.isArray(data.openHouseSchedule) && data.openHouseSchedule.length > 0) {
    availability += availability ? " · Open House" : "Open House";
  }
  // Days on market as fallback signal
  if (!availability && data.daysOnZillow != null) {
    availability = data.daysOnZillow === 0 ? "New listing" : `${data.daysOnZillow}d on market`;
  } else if (!availability && data.timeOnZillow) {
    availability = data.timeOnZillow as string;
  }
  // Listing date fallback
  if (!availability && data.listingDateTimeOnZillow) {
    availability = `Listed ${data.listingDateTimeOnZillow}`;
  }

  return enrichListing({
    source: "Zillow",
    title: address || (data.statusText as string) || "Zillow Listing",
    price: Math.round(price),
    pricePerPerson: null,
    bedrooms: beds ? Math.round(beds) : null,
    bathrooms: baths ?? null,
    neighborhood: hood,
    address,
    sqft: (data.area ?? data.livingArea ?? null) as number | null,
    zipCode: "",
    url: detailUrl,
    commuteTransit: null,
    commuteBike: null,
    transitRoute: "",
    mapsUrl: "",
    availability,
  });
}

async function scrapeZillow(): Promise<Listing[]> {
  const listings: Listing[] = [];
  const neighborhoods: Record<string, string> = {
    "Nob Hill": "nob-hill-san-francisco-ca",
    "Japantown": "japantown-san-francisco-ca",
    "Mission District": "mission-district-san-francisco-ca",
    "Duboce Triangle": "duboce-triangle-san-francisco-ca",
  };

  for (const [hoodName, hoodSlug] of Object.entries(neighborhoods)) {
    const searchState = JSON.stringify({
      pagination: {},
      isMapVisible: false,
      filterState: {
        beds: { min: MIN_BEDS, max: MAX_BEDS },
        baths: { min: MIN_BATHS },
        price: { min: MIN_PRICE, max: MAX_PRICE },
        monthlyPayment: { min: MIN_PRICE, max: MAX_PRICE },
        isForRent: { value: true },
        isForSaleByAgent: { value: false },
        isForSaleByOwner: { value: false },
        isNewConstruction: { value: false },
        isComingSoon: { value: false },
        isAuction: { value: false },
        isForSaleForeclosure: { value: false },
      },
    });

    const url = `https://www.zillow.com/${hoodSlug}/rentals/?searchQueryState=${encodeURIComponent(searchState)}`;

    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Extract JSON data from script tags
      $('script[type="application/json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).text());
          const results = extractZillowResults(data);
          for (const r of results) {
            const listing = zillowResultToListing(r, hoodName);
            if (listing) listings.push(listing);
          }
        } catch { /* ignore parse errors */ }
      });

      // Parse HTML cards as fallback
      $("article[data-test='property-card'], .property-card-data").each((_, el) => {
        const card = $(el);
        const link = card.find("a[href*='/homedetails/']").first();
        if (!link.length) return;

        let cardUrl = link.attr("href") || "";
        if (cardUrl && !cardUrl.startsWith("http")) cardUrl = `https://www.zillow.com${cardUrl}`;

        const titleText = link.text().trim();
        const priceEl = card.find("[data-test='property-card-price']").first();
        const price = priceEl.length ? parsePrice(priceEl.text()) : null;

        const detailsEl = card.find(".property-card-details").first();
        const { beds, baths, sqft } = detailsEl.length
          ? parseHousingInfo(detailsEl.text())
          : { beds: null, baths: null, sqft: null };

        listings.push(
          enrichListing({
            source: "Zillow",
            title: titleText,
            price,
            pricePerPerson: null,
            bedrooms: beds,
            bathrooms: baths,
            neighborhood: hoodName,
            address: titleText,
            sqft,
            zipCode: "",
            url: cardUrl,
            commuteTransit: null,
            commuteBike: null,
            transitRoute: "",
            mapsUrl: "",
            availability: "",
          })
        );
      });

      // Rate limit
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      // Network errors — skip this neighborhood
    }
  }
  return listings;
}

// ── Craigslist Scraper ───────────────────────────────────────────────────

async function scrapeCraigslist(): Promise<Listing[]> {
  const listings: Listing[] = [];
  const hoods = ["nob hill", "japantown", "mission district", "duboce triangle"];

  for (const hood of hoods) {
    const params = new URLSearchParams({
      query: hood,
      min_price: String(MIN_PRICE),
      max_price: String(MAX_PRICE),
      min_bedrooms: String(MIN_BEDS),
      max_bedrooms: String(MAX_BEDS),
      min_bathrooms: String(MIN_BATHS),
    });

    try {
      const res = await fetchWithTimeout(
        `https://sfbay.craigslist.org/search/sfc/apa?${params}`
      );
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $("li.cl-search-result, div.result-row").each((_, el) => {
        const card = $(el);
        const link = card.find("a.posting-title, a.titlestring, a[href*='/apa/']").first();
        if (!link.length) return;

        const title = link.text().trim();
        let cardUrl = link.attr("href") || "";
        if (!cardUrl.startsWith("http")) cardUrl = `https://sfbay.craigslist.org${cardUrl}`;

        const priceEl = card.find(".priceinfo, .result-price, .price").first();
        const price = priceEl.length ? parsePrice(priceEl.text()) : null;

        const housingEl = card.find(".housing, .meta .bedrooms").first();
        const { beds, baths, sqft } = parseHousingInfo(housingEl.text() || title);

        const hoodEl = card.find(".result-hood, .neighborhood").first();
        const hoodText = hoodEl.length ? hoodEl.text().trim().replace(/[()]/g, "") : hood;

        listings.push(
          enrichListing({
            source: "Craigslist",
            title,
            price,
            pricePerPerson: null,
            bedrooms: beds,
            bathrooms: baths,
            neighborhood: hoodText || hood,
            address: "",
            sqft,
            zipCode: "",
            url: cardUrl,
            commuteTransit: null,
            commuteBike: null,
            transitRoute: "",
            mapsUrl: "",
            availability: "",
          })
        );
      });

      await new Promise((r) => setTimeout(r, 1500));
    } catch { /* skip */ }
  }
  return listings;
}

// ── Search URLs ──────────────────────────────────────────────────────────

export function generateSearchUrls(): SearchLink[] {
  const urls: SearchLink[] = [];
  const z: Record<string, string> = {
    "Nob Hill": "nob-hill-san-francisco-ca",
    Japantown: "japantown-san-francisco-ca",
    "Mission District": "mission-district-san-francisco-ca",
    "Duboce Triangle": "duboce-triangle-san-francisco-ca",
  };
  const a: Record<string, string> = {
    "Nob Hill": "nob-hill",
    Japantown: "japantown",
    "Mission District": "mission-district",
    "Duboce Triangle": "duboce-triangle",
  };

  // Zillow (auto-scraped)
  for (const [hood, slug] of Object.entries(z)) {
    urls.push({ site: "Zillow", neighborhood: hood, url: `https://www.zillow.com/${slug}/rentals/${MIN_BEDS}-${MAX_BEDS}_beds/2.0-_baths/${MIN_PRICE}-${MAX_PRICE}_mp/` });
  }
  // Craigslist
  for (const hood of ["nob hill", "japantown", "mission district", "duboce triangle"]) {
    const p = new URLSearchParams({ query: hood, min_price: String(MIN_PRICE), max_price: String(MAX_PRICE), min_bedrooms: String(MIN_BEDS), max_bedrooms: String(MAX_BEDS), min_bathrooms: String(MIN_BATHS) });
    urls.push({ site: "Craigslist", neighborhood: hood.replace(/\b\w/g, (c) => c.toUpperCase()), url: `https://sfbay.craigslist.org/search/sfc/apa?${p}` });
  }
  // Apartments.com
  for (const [hood, slug] of Object.entries(a)) {
    urls.push({ site: "Apartments.com", neighborhood: hood, url: `https://www.apartments.com/${slug}-san-francisco-ca/${MIN_BEDS}-to-${MAX_BEDS}-bedrooms-${MIN_BATHS}-bathrooms/?priceRange=${MIN_PRICE}-${MAX_PRICE}` });
  }
  // HotPads
  for (const [hood, slug] of Object.entries(a)) {
    urls.push({ site: "HotPads", neighborhood: hood, url: `https://hotpads.com/${slug}-san-francisco-ca/apartments-for-rent?beds=${MIN_BEDS}-${MAX_BEDS}&baths=${MIN_BATHS}&price=${MIN_PRICE}-${MAX_PRICE}` });
  }
  // Trulia
  for (const [hood, slug] of Object.entries({ "Nob Hill": "nob_hill", Japantown: "japantown", "Mission": "mission_dolores", "Duboce Triangle": "duboce_triangle" })) {
    urls.push({ site: "Trulia", neighborhood: hood, url: `https://www.trulia.com/for_rent/San_Francisco,CA/${slug}/3p_beds/2p_baths/${MIN_PRICE}-${MAX_PRICE}_price/` });
  }
  // Facebook Marketplace
  urls.push({ site: "Facebook Marketplace", neighborhood: "All SF", url: `https://www.facebook.com/marketplace/sanfrancisco/propertyrentals?minPrice=${MIN_PRICE}&maxPrice=${MAX_PRICE}&minBedrooms=${MIN_BEDS}&maxBedrooms=${MAX_BEDS}` });
  // Facebook Groups (popular SF housing groups)
  urls.push({ site: "FB Groups", neighborhood: "SF Housing", url: "https://www.facebook.com/groups/sfhousingrentals/" });
  urls.push({ site: "FB Groups", neighborhood: "Bay Area Rooms", url: "https://www.facebook.com/groups/bayaboroomsforrent/" });
  urls.push({ site: "FB Groups", neighborhood: "SF Rentals", url: "https://www.facebook.com/groups/SFrentals/" });
  // RentSFNow
  urls.push({ site: "RentSFNow", neighborhood: "All SF", url: "https://www.rentsfnow.com/apartments/sf/" });
  // Redfin
  urls.push({ site: "Redfin", neighborhood: "All SF", url: "https://www.redfin.com/city/17151/CA/San-Francisco/apartments-for-rent/filter/beds=3-4,baths=2,min-price=4000,max-price=12000" });
  // Rent.com
  for (const [hood, slug] of Object.entries(a)) {
    urls.push({ site: "Rent.com", neighborhood: hood, url: `https://www.rent.com/california/san-francisco-${slug}-apartments/bedrooms-${MIN_BEDS}-${MAX_BEDS}/bathrooms-${MIN_BATHS}` });
  }
  return urls;
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function scrapeAll(): Promise<{ listings: Listing[]; searchUrls: SearchLink[]; scrapedAt: string }> {
  const [zillow, craigslist] = await Promise.all([
    scrapeZillow(),
    scrapeCraigslist(),
  ]);

  const all = [...zillow, ...craigslist];

  // Dedup by URL
  const seen = new Set<string>();
  const unique = all.filter((l) => {
    const key = l.url.replace(/\/$/, "").split("?")[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter
  const filtered = unique.filter(passesFilters);

  // Sort by best commute, then price per person
  filtered.sort((a, b) => {
    const ca = bestCommute(a);
    const cb = bestCommute(b);
    if (ca !== cb) return ca - cb;
    return (a.pricePerPerson ?? 99999) - (b.pricePerPerson ?? 99999);
  });

  return {
    listings: filtered,
    searchUrls: generateSearchUrls(),
    scrapedAt: new Date().toISOString(),
  };
}
