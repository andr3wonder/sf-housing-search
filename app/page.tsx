import { cacheLife } from "next/cache";
import { scrapeAll, type Listing, type SearchLink } from "@/lib/scraper";

export default async function Home() {
  "use cache";
  cacheLife("days");

  const { listings, searchUrls, scrapedAt } = await scrapeAll();
  const date = new Date(scrapedAt);
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const tier1 = listings.filter((l) => l.commuteBike !== null && l.commuteBike <= 12);
  const tier2 = listings.filter((l) => l.commuteBike !== null && l.commuteBike > 12 && l.commuteBike <= 15);
  const tier3 = listings.filter((l) => l.commuteBike !== null && l.commuteBike > 15 && l.commuteBike <= 20);
  const tier4 = listings.filter((l) => l.commuteBike === null || l.commuteBike > 20);

  const topPicks = [...tier1, ...tier2].filter((l) => l.price).slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-200 p-4 md:p-8 max-w-[1200px] mx-auto font-sans">
      <h1 className="text-3xl font-bold text-white mb-1">SF Housing Search</h1>
      <p className="text-gray-500 text-sm mb-6">
        3-4 BR &middot; 2+ BA &middot;{" "}
        <span className="text-sky-400">Nob Hill &middot; Japantown &middot; Mission &middot; Duboce Triangle</span>
        <br />
        Commute to LinkedIn (222 2nd St) by bike/scooter or BART/Muni
        <br />
        Last updated: {formatted} &middot; {listings.filter((l) => l.price).length} listings
      </p>

      {topPicks.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a2a1a] to-[#1a1a2a] border border-green-800 rounded-xl p-5 mb-6">
          <h2 className="text-green-400 font-semibold text-lg mb-3">Top Picks</h2>
          {topPicks.map((l, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0 text-sm">
              <a href={l.url} target="_blank" rel="noopener" className="text-sky-400 hover:underline">
                {l.title.split(",")[0]}
              </a>
              <span className="text-gray-500 text-xs ml-2 whitespace-nowrap">
                ${l.price?.toLocaleString()}/mo &middot; {l.bedrooms}BR &middot; {l.commuteBike}m bike &middot; {l.commuteTransit}m transit
              </span>
            </div>
          ))}
        </div>
      )}

      <Tier title="Closest — Under 12 min bike" subtitle="SoMa / Mission adjacent / North Beach" items={tier1} color="border-green-500" />
      <Tier title="Very Close — 15 min bike" subtitle="Nob Hill proper / Mission / Potrero" items={tier2} color="border-sky-400" />
      <Tier title="Easy Ride — 18-20 min bike" subtitle="Japantown / Duboce Triangle / Haight" items={tier3} color="border-orange-400" />
      <Tier title="Further Out — 22+ min" subtitle="Outer neighborhoods" items={tier4} color="border-gray-500" />

      <SearchLinks urls={searchUrls} />

      <p className="text-center text-gray-600 text-xs mt-8">
        Auto-updated daily via Vercel Cron &middot; Commute times are neighborhood estimates — click Commute to verify
      </p>
    </div>
  );
}

function Tier({ title, subtitle, items, color }: { title: string; subtitle: string; items: Listing[]; color: string }) {
  const withPrice = items.filter((l) => l.price);
  if (withPrice.length === 0) return null;

  return (
    <div className={`bg-[#1a1a1a] rounded-xl p-5 mb-4 border-l-4 ${color}`}>
      <h2 className="text-white font-semibold text-lg">{title}</h2>
      <p className="text-gray-500 text-xs mb-3">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-700">
              <th className="text-left py-2 px-2">Listing</th>
              <th className="text-left py-2 px-2">Price</th>
              <th className="text-left py-2 px-2">Beds</th>
              <th className="text-left py-2 px-2">Commute</th>
              <th className="text-left py-2 px-2 hidden md:table-cell">Route</th>
              <th className="text-left py-2 px-2">Availability</th>
              <th className="text-left py-2 px-2">Links</th>
            </tr>
          </thead>
          <tbody>
            {withPrice.map((l, i) => (
              <tr key={i} className="border-b border-gray-800 hover:bg-[#222]">
                <td className="py-2 px-2">
                  <a href={l.url} target="_blank" rel="noopener" className="text-sky-400 hover:underline font-medium">
                    {l.title.split(",")[0]}
                  </a>
                  <span className="block text-xs text-gray-500">{l.neighborhood}</span>
                </td>
                <td className="py-2 px-2 font-semibold whitespace-nowrap">
                  ${l.price?.toLocaleString()}
                  <span className="block text-xs text-gray-500 font-normal">
                    {l.pricePerPerson ? `$${l.pricePerPerson.toLocaleString()}/pp` : ""}
                  </span>
                </td>
                <td className="py-2 px-2">
                  {l.bedrooms}BR{l.bathrooms ? `/${l.bathrooms}BA` : ""}
                  {l.sqft ? <span className="block text-xs text-gray-500">{l.sqft} sqft</span> : null}
                </td>
                <td className="py-2 px-2 whitespace-nowrap text-sm">
                  {l.commuteTransit ? <span className="mr-2">🚌 {l.commuteTransit}m</span> : null}
                  {l.commuteBike ? <span>🚲 {l.commuteBike}m</span> : null}
                </td>
                <td className="py-2 px-2 text-xs text-gray-400 hidden md:table-cell">{l.transitRoute}</td>
                <td className="py-2 px-2 text-xs">
                  {l.availability ? (
                    <span className={l.availability.includes("Now") || l.availability.includes("New") ? "text-green-400" : "text-yellow-400"}>
                      {l.availability}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="py-2 px-2 text-xs space-x-2">
                  <a href={l.url} target="_blank" rel="noopener" className="text-green-400 hover:underline">Zillow</a>
                  <a href={l.mapsUrl} target="_blank" rel="noopener" className="text-green-400 hover:underline">Commute</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchLinks({ urls }: { urls: SearchLink[] }) {
  const bySite: Record<string, SearchLink[]> = {};
  for (const u of urls) {
    (bySite[u.site] ??= []).push(u);
  }

  // Separate auto-scraped vs manual-browse
  const scraped = ["Zillow"];
  const manual = Object.keys(bySite).filter((s) => !scraped.includes(s));

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 mt-6">
      <h2 className="text-white font-semibold text-lg mb-3">Browse All Sources</h2>
      <p className="text-gray-500 text-xs mb-3">
        Zillow is auto-scraped above. Most other sites block automated scraping, so here are direct links with filters pre-applied — open in your browser.
      </p>
      {manual.map((site) => (
        <div key={site} className="text-sm mb-2">
          <strong className="text-gray-300">{site}:</strong>{" "}
          {bySite[site].map((l, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <a href={l.url} target="_blank" rel="noopener" className="text-sky-400 hover:underline">
                {l.neighborhood}
              </a>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
