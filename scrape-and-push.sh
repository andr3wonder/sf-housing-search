#!/bin/bash
# Runs the scraper locally (where Zillow actually works), saves results
# as static JSON, commits & pushes so Vercel auto-deploys with fresh data.

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRAPER_DIR="$APP_DIR/../sf-housing-scraper"
VENV="$SCRAPER_DIR/venv/bin/python3"
DATA_FILE="$APP_DIR/public/data.json"

mkdir -p "$APP_DIR/public"

echo "$(date): Running scraper locally..."
"$VENV" -W ignore -c "
import sys, json, io
sys.path.insert(0, '$SCRAPER_DIR')
# Suppress all print output from scraper — only our final JSON goes to stdout
_real_stdout = sys.stdout
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
from scraper import *

all_listings = []
all_listings.extend(scrape_craigslist())
all_listings.extend(scrape_zillow())
all_listings.extend(scrape_apartments())
all_listings.extend(scrape_hotpads())

all_listings = dedup_listings(all_listings)
filtered = [l for l in all_listings if l.passes_filters()]
scraped = [l for l in filtered if 'manual link' not in l.source and l.price]
scraped.sort(key=lambda x: (x.best_commute() or 99, x.price_per_person or 99999))

results = []
for l in scraped:
    results.append({
        'title': l.title.split(',')[0],
        'address': l.address,
        'price': l.price,
        'pp': l.price_per_person,
        'beds': l.bedrooms,
        'baths': l.bathrooms,
        'sqft': l.sqft,
        'hood': COMMUTE_BY_ZIP.get(l.zip_code, {}).get('hood', l.neighborhood) if l.zip_code else l.neighborhood,
        'zip': l.zip_code,
        'transit': l.commute_transit,
        'bike': l.commute_bike,
        'route': l.transit_route,
        'url': l.url,
        'maps': l.maps_commute_url,
    })

urls = generate_search_urls()
search_urls = [{'site': u['site'], 'neighborhood': u['neighborhood'], 'url': u['url']} for u in urls]

output = {
    'listings': results,
    'searchUrls': search_urls,
    'scrapedAt': __import__('datetime').datetime.now().isoformat(),
    'count': len(results),
}
sys.stdout = _real_stdout
print(json.dumps(output, indent=2))
" > "$DATA_FILE"

COUNT=$(cat "$DATA_FILE" | grep -o '"count":' | wc -l)
echo "$(date): Saved $(python3 -c "import json; print(json.load(open('$DATA_FILE'))['count'])" 2>/dev/null || echo '?') listings to data.json"

cd "$APP_DIR"
git add public/data.json
git commit --author="Andrew Chuang <andrewchuang0110@gmail.com>" \
  -m "Update listings $(date +%Y-%m-%d)" 2>/dev/null || echo "No changes to commit"
git push 2>/dev/null || echo "Push failed"

echo "$(date): Done! Vercel will auto-deploy."
