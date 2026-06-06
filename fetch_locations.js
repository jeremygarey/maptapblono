/**
 * fetch_locations.js — Bloomington-Normal OSM location fetcher
 * Usage: node fetch_locations.js > locations.js
 * Requires Node 18+
 */

const BBOX = { south: 40.43, west: -89.05, north: 40.55, east: -88.89 };

const CATEGORIES = [
  {
    key: "amenity",
    values: ["restaurant", "cafe", "bar", "fast_food", "pub"],
    type: "Food & Drink",
  },
  {
    key: "amenity",
    values: ["school", "university", "college", "library"],
    type: "Education",
  },
  {
    key: "amenity",
    values: ["hospital", "clinic", "pharmacy", "doctors"],
    type: "Medical",
  },
  { key: "amenity", values: ["place_of_worship"], type: "Church" },
  {
    key: "amenity",
    values: ["theatre", "cinema", "arts_centre"],
    type: "Venue",
  },
  {
    key: "amenity",
    values: ["townhall", "courthouse", "fire_station", "police", "post_office"],
    type: "Civic",
  },
  {
    key: "leisure",
    values: [
      "park",
      "playground",
      "sports_centre",
      "golf_course",
      "swimming_pool",
    ],
    type: "Park",
  },
  {
    key: "tourism",
    values: ["museum", "attraction", "hotel", "motel", "zoo"],
    type: "Attraction",
  },
  {
    key: "shop",
    values: ["supermarket", "mall", "department_store", "convenience"],
    type: "Shopping",
  },
  { key: "historic", values: ["monument", "memorial"], type: "Landmark" },
];

// Chains that appear multiple times and aren't fun for a location game.
// Add more here as you find them in your output.
const CHAIN_BLOCKLIST = new Set([
  "McDonald's",
  "Starbucks",
  "Subway",
  "Walmart",
  "Walgreens",
  "CVS",
  "Dollar General",
  "Dollar Tree",
  "Family Dollar",
  "Casey's",
  "Dunkin'",
  "Dunkin",
  "Taco Bell",
  "Burger King",
  "Wendy's",
  "Culver's",
  "Hardee's",
  "Arby's",
  "Sonic",
  "Domino's",
  "Pizza Hut",
  "Papa John's",
  "Little Caesars",
  "Panda Express",
  "Chipotle",
  "Panera Bread",
  "Jimmy John's",
  "Jersey Mike's",
  "Firehouse Subs",
  "Popeyes",
  "Chick-fil-A",
  "KFC",
  "Dairy Queen",
  "Baskin-Robbins",
  "ALDI",
  "Hy-Vee",
  "Kroger",
  "Meijer",
  "Target",
  "Sam's Club",
  "AutoZone",
  "O'Reilly Auto Parts",
  "Advance Auto Parts",
  "Planet Fitness",
  "Anytime Fitness",
  "Chase",
  "Chase Bank",
  "BMO",
  "BMO Bank",
  "Holiday Inn",
  "Hampton Inn",
  "Comfort Inn",
  "Comfort Suites",
  "Super 8",
  "Motel 6",
  "Best Western",
  "Fairfield Inn",
]);

async function fetchCategory({ key, values, type }) {
  const { south, west, north, east } = BBOX;
  const blocks = values
    .flatMap((v) => [
      `node["${key}"="${v}"](${south},${west},${north},${east});`,
      `way["${key}"="${v}"](${south},${west},${north},${east});`,
    ])
    .join("\n");

  const query = `
[out:json]
[timeout:90]
;
(
${blocks}
);
out center;
`;

  const result = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: {
      "User-Agent": "BloomingtonNormalMapGame/1.0",
      Referer: "http://localhost",
    },
  });

  if (!result.ok) {
    const text = await result.text();
    throw new Error(`HTTP ${result.status}: ${text.slice(0, 300)}`);
  }

  const json = await result.json();
  return json.elements;
}

function toLocation(el, type) {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null;
  // if (CHAIN_BLOCKLIST.has(name)) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!lat || !lng) return null;

  // Keep street separate; disambiguation applied after all locations are collected
  return {
    name,
    street: tags["addr:street"] ?? null,
    type,
    lat: +lat.toFixed(7),
    lng: +lng.toFixed(7),
  };
}

// Append street only to locations whose bare name appears more than once
function disambiguateNames(locations) {
  const nameCounts = new Map();
  for (const loc of locations) {
    nameCounts.set(loc.name, (nameCounts.get(loc.name) ?? 0) + 1);
  }
  return locations.map(({ name, street, ...rest }) => ({
    name: nameCounts.get(name) > 1 && street ? `${name} (${street})` : name,
    ...rest,
  }));
}

async function main() {
  const seen = new Set();
  const locations = [];

  for (const cat of CATEGORIES) {
    process.stderr.write(`Fetching: ${cat.type}...\n`);
    try {
      const elements = await fetchCategory(cat);
      let added = 0;
      for (const el of elements) {
        const loc = toLocation(el, cat.type);
        if (!loc) continue;
        const key = `${loc.name}|${loc.lat}|${loc.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        locations.push(loc);
        added++;
      }
      process.stderr.write(`  ✓ ${added} locations\n`);
    } catch (err) {
      process.stderr.write(`  ✗ ${err.message}\n`);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }

  const final = disambiguateNames(locations);
  const js = `// ${final.length} locations — OpenStreetMap, Bloomington-Normal IL\nconst locations = ${JSON.stringify(final, null, 2)};\n`;
  process.stdout.write(js);
  process.stderr.write(`\nDone — ${final.length} total locations.\n`);
}

main();
