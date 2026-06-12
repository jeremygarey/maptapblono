const BLOOMINGTON_NORMAL_CENTER = [40.5084, -88.9937];
const GAME_ROUNDS = 5;
const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;
const PERFECT_SCORE_RADIUS_FEET = 100;
const MAX_SCORE_DISTANCE_FEET = FEET_PER_MILE * 3;
const SCORE_CURVE_EXPONENT = 1.35;
const MOBILE_INITIAL_ZOOM = 12;
const DESKTOP_INITIAL_ZOOM = 13;
const WIDE_SCREEN_QUERY = "(min-width: 1100px)";

const state = {
  roundIndex: 0,
  totalScore: 0,
  guessed: false,
  dailyLocations: [],
  results: [],
};

function initialZoom() {
  return window.matchMedia(WIDE_SCREEN_QUERY).matches
    ? DESKTOP_INITIAL_ZOOM
    : MOBILE_INITIAL_ZOOM;
}

const map = L.map("map", {
  zoomControl: false,
  minZoom: 11,
  maxBounds: [
    [40.39, -89.12],
    [40.61, -88.86],
  ],
  maxBoundsViscosity: 0.75,
}).setView(BLOOMINGTON_NORMAL_CENTER, initialZoom());

L.control.zoom({ position: "bottomright" }).addTo(map);

const mapLayer = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    detectRetina: true,
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  },
);

const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    detectRetina: true,
    maxZoom: 19,
    attribution: "Tiles &copy; Esri",
  },
).addTo(map);

function retryTileLoad(event) {
  const tile = event.tile;
  const originalSrc = tile.dataset.originalSrc || tile.src;
  tile.dataset.originalSrc = originalSrc;

  window.setTimeout(() => {
    tile.src = `${originalSrc}${originalSrc.includes("?") ? "&" : "?"}retry=${Date.now()}`;
  }, 500);
}

mapLayer.on("tileerror", retryTileLoad);
satelliteLayer.on("tileerror", retryTileLoad);

let guessMarker = null;
let targetMarker = null;
let resultLine = null;

const totalScoreEl = document.querySelector("#totalScore");
const roundLabelEl = document.querySelector("#roundLabel");
const tapPromptEl = document.querySelector("#tapPrompt");
const nextButton = document.querySelector("#nextButton");
const layerMenu = document.querySelector("#layerMenu");
const layerToggle = document.querySelector("#layerToggle");
const mapModeButton = document.querySelector("#mapMode");
const satelliteModeButton = document.querySelector("#satelliteMode");
const roundsPanel = document.querySelector("#roundsPanel");
const roundsToggle = document.querySelector("#roundsToggle");
const roundsSummaryEl = document.querySelector("#roundsSummary");
const roundListEl = document.querySelector("#roundList");
const roundItemTemplate = document.querySelector("#roundItemTemplate");
const mobileLayoutQuery = window.matchMedia("(max-width: 820px)");
const shareButton = document.querySelector("#shareButton");

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySelection() {
  const random = seededRandom(hashString(`maptap-blono-${todayKey()}`));
  const pool = [...locations];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, GAME_ROUNDS);
}

function scoreDistance(distanceMeters) {
  const distanceFeet = distanceMeters * FEET_PER_METER;
  const adjustedDistance = Math.max(
    0,
    distanceFeet - PERFECT_SCORE_RADIUS_FEET,
  );
  const ratio = Math.max(0, 1 - adjustedDistance / MAX_SCORE_DISTANCE_FEET);
  return Math.round(100 * ratio ** SCORE_CURVE_EXPONENT);
}

function formatDistance(distanceMeters) {
  const distanceFeet = distanceMeters * FEET_PER_METER;

  if (distanceFeet < 1000) {
    return `${Math.round(distanceFeet).toLocaleString()} ft`;
  }

  const distanceMiles = distanceFeet / FEET_PER_MILE;
  const precision = distanceMiles < 10 ? 1 : 0;
  return `${distanceMiles.toFixed(precision)} mi`;
}

function clearRoundMarkers() {
  [guessMarker, targetMarker, resultLine].forEach((layer) => {
    if (layer) {
      map.removeLayer(layer);
    }
  });

  guessMarker = null;
  targetMarker = null;
  resultLine = null;
}

function renderRoundList() {
  roundListEl.innerHTML = "";
  roundsSummaryEl.textContent = `${state.totalScore} / ${GAME_ROUNDS * 100}`;

  state.dailyLocations.forEach((location, index) => {
    const item = roundItemTemplate.content.firstElementChild.cloneNode(true);
    const result = state.results[index];
    item.querySelector(".round-name").textContent =
      `${index + 1}. ${location.name}`;
    item.querySelector(".round-score").textContent = result
      ? `${result.score}`
      : "-";
    roundListEl.appendChild(item);
  });
}

function syncRoundsTray() {
  const isFinished = state.roundIndex >= GAME_ROUNDS;
  const shouldCollapse = mobileLayoutQuery.matches && !isFinished;
  roundsPanel.classList.toggle("collapsed", shouldCollapse);
  roundsToggle.setAttribute("aria-expanded", String(!shouldCollapse));
}

function toggleRoundsTray() {
  const isCollapsed = roundsPanel.classList.toggle("collapsed");
  roundsToggle.setAttribute("aria-expanded", String(!isCollapsed));

  window.setTimeout(() => {
    map.invalidateSize();
  }, 180);
}

function toggleLayerMenu() {
  const isOpen = layerMenu.classList.toggle("open");
  layerToggle.setAttribute("aria-expanded", String(isOpen));
}

function closeLayerMenu() {
  layerMenu.classList.remove("open");
  layerToggle.setAttribute("aria-expanded", "false");
}

function renderCurrentRound() {
  const isFinished = state.roundIndex >= GAME_ROUNDS;

  roundsPanel.classList.toggle("finished", isFinished);
  totalScoreEl.textContent = state.totalScore;
  roundLabelEl.textContent = isFinished
    ? "Done"
    : `${state.roundIndex + 1} / ${GAME_ROUNDS}`;
  tapPromptEl.textContent = isFinished
    ? `Final score: ${state.totalScore} / 500`
    : `Where is ${state.dailyLocations[state.roundIndex].name}?`;

  nextButton.textContent =
    state.roundIndex === GAME_ROUNDS - 1 ? "Finish game" : "Next round";
  nextButton.disabled = true;
  state.guessed = false;
  clearRoundMarkers();
  renderRoundList();

  if (isFinished) {
    roundsPanel.classList.remove("collapsed");
    roundsToggle.setAttribute("aria-expanded", "true");
    shareButton.style.display = isFinished ? "block" : "none";
  }
}

function showGuessResult(event) {
  if (state.guessed || state.roundIndex >= GAME_ROUNDS) {
    return;
  }

  const target = state.dailyLocations[state.roundIndex];
  const targetLatLng = L.latLng(target.lat, target.lng);
  const distance = event.latlng.distanceTo(targetLatLng);
  const score = scoreDistance(distance);

  state.guessed = true;
  state.totalScore += score;
  state.results[state.roundIndex] = {
    score,
    distance,
  };

  guessMarker = L.marker(event.latlng)
    .addTo(map)
    .bindTooltip("Your tap", {
      permanent: true,
      direction: "top",
      offset: [0, -8],
    });

  targetMarker = L.marker(targetLatLng, {
    icon: L.divIcon({
      className: "",
      html: `<div class="target-marker">${state.roundIndex + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  })
    .addTo(map)
    .bindTooltip(target.name, {
      permanent: true,
      direction: "bottom",
      offset: [0, 12],
    });

  resultLine = L.polyline([event.latlng, targetLatLng], {
    color: "#cf3f2f",
    dashArray: "8 8",
    weight: 3,
  }).addTo(map);

  totalScoreEl.textContent = state.totalScore;
  tapPromptEl.textContent = `+${score} points - ${formatDistance(distance)} away`;
  nextButton.disabled = false;
  renderRoundList();
}

function nextRound() {
  if (!state.guessed) {
    return;
  }

  state.roundIndex += 1;
  renderCurrentRound();
}

function setLayer(mode) {
  const useSatellite = mode === "satellite";

  if (useSatellite) {
    map.removeLayer(mapLayer);
    satelliteLayer.addTo(map);
  } else {
    map.removeLayer(satelliteLayer);
    mapLayer.addTo(map);
  }

  satelliteModeButton.classList.toggle("active", useSatellite);
  mapModeButton.classList.toggle("active", !useSatellite);
  closeLayerMenu();
}

function buildShareText() {
  const [year, month, day] = todayKey().split("-").map(Number);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));

  function scoreEmoji(score) {
    if (score >= 90) return "🟩";
    if (score >= 60) return "🟨";
    if (score >= 30) return "🟧";
    return "🟥";
  }

  const emojiRow = state.results.map((r) => scoreEmoji(r.score)).join("");
  const lines = [
    `📍 MapTap BloNo – ${dateStr}`,
    `Score: ${state.totalScore} / 500`,
    ``,
    emojiRow,
    ``,
    ...state.dailyLocations.map((loc, i) => {
      const r = state.results[i];
      return `${scoreEmoji(r.score)} ${loc.name}: ${r.score}/100 (${formatDistance(r.distance)})`;
    }),
  ];

  return lines.join("\n");
}

function shareResults() {
  const text = buildShareText();

  if (navigator.share) {
    // Native share sheet on mobile
    navigator.share({ text }).catch(() => {});
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      shareButton.textContent = "Copied!";
      setTimeout(() => (shareButton.textContent = "Share Results"), 2000);
    });
  }
}

shareButton.addEventListener("click", shareResults);

state.dailyLocations = dailySelection();
renderCurrentRound();

map.on("click", showGuessResult);
nextButton.addEventListener("click", nextRound);
mapModeButton.addEventListener("click", () => setLayer("map"));
satelliteModeButton.addEventListener("click", () => setLayer("satellite"));
layerToggle.addEventListener("click", toggleLayerMenu);
document.addEventListener("click", (event) => {
  if (!layerMenu.contains(event.target)) {
    closeLayerMenu();
  }
});
roundsToggle.addEventListener("click", toggleRoundsTray);
mobileLayoutQuery.addEventListener("change", syncRoundsTray);
syncRoundsTray();

requestAnimationFrame(() => {
  map.invalidateSize();
});

window.addEventListener("load", () => {
  map.invalidateSize();
});

window.addEventListener("resize", () => {
  map.invalidateSize();
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    map.invalidateSize();
  });
}
