// Common Indian Cities Coordinate Lookup Engine
export const CITY_COORDINATES = {
  vijayawada: { name: "Vijayawada", lat: 16.5062, lng: 80.6480 },
  kakinada: { name: "Kakinada", lat: 16.9891, lng: 82.2475 },
  visakhapatnam: { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185 },
  vizag: { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185 },
  guntur: { name: "Guntur", lat: 16.3067, lng: 80.4365 },
  rajahmundry: { name: "Rajahmundry", lat: 17.0005, lng: 81.8040 },
  tirupati: { name: "Tirupati", lat: 13.6288, lng: 79.4192 },
  srikakulam: { name: "Srikakulam", lat: 18.3000, lng: 83.9000 },
  kollam: { name: "Kollam", lat: 8.8932, lng: 76.6141 },
  nellore: { name: "Nellore", lat: 14.4426, lng: 79.9865 },
  kurnool: { name: "Kurnool", lat: 15.8281, lng: 78.0373 },
  anantapur: { name: "Anantapur", lat: 14.6819, lng: 77.6006 },
  ongole: { name: "Ongole", lat: 15.5057, lng: 80.0499 },
  eluru: { name: "Eluru", lat: 16.7107, lng: 81.1035 },
  kadapa: { name: "Kadapa", lat: 14.4673, lng: 78.8242 },
  warangal: { name: "Warangal", lat: 17.9689, lng: 79.5941 },
  hyderabad: { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  chennai: { name: "Chennai", lat: 13.0827, lng: 80.2707 },
  bangalore: { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  bengaluru: { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  mumbai: { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
  "new delhi": { name: "New Delhi", lat: 28.6139, lng: 77.2090 },
  delhi: { name: "New Delhi", lat: 28.6139, lng: 77.2090 },
  kolkata: { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  pune: { name: "Pune", lat: 18.5204, lng: 73.8567 },
};

/**
 * Returns { lat, lng, name } for a city string (e.g., "Kakinada", "Kakinada, AP")
 *
 * Safety rules (mirrors TrackingMap.lookupCity):
 *  - Strings ≤2 chars (e.g. "AP", "TN") are NOT matched via substring.
 *  - Partial matching only fires on tokens ≥3 chars using word-boundary checks.
 */
export function getCityCoordinates(cityStr) {
  if (!cityStr) return null;
  const raw = String(cityStr).trim();
  const key = raw.toLowerCase();

  // 1. Exact key match
  for (const [cityName, coords] of Object.entries(CITY_COORDINATES)) {
    if (key === cityName) return coords;
  }

  // 2. State abbreviation guard — never partial-match 1–2 char strings
  if (key.length <= 2) return null;

  // 3. Word-boundary aware match (city name appears as a whole word in the input)
  for (const [cityName, coords] of Object.entries(CITY_COORDINATES)) {
    if (cityName.length < 3) continue;
    const re = new RegExp(
      `(?:^|[\\s,])${cityName.replace(/[-]/g, '\\-')}(?:$|[\\s,])`
    );
    if (re.test(key)) return coords;
  }

  // 4. Token-based exact match — split input and check each token ≥3 chars
  const tokens = key.split(/[\s,]+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    for (const [cityName, coords] of Object.entries(CITY_COORDINATES)) {
      if (cityName === token) return coords;
      // Starts-with match only for longer tokens (≥4 chars) to avoid false positives
      if (cityName.length >= 3 && cityName.startsWith(token) && token.length >= 4) return coords;
    }
  }

  return null;
}

/**
 * Generates smooth path points between two GPS points
 */
export function generateRoutePoints(startLat, startLng, endLat, endLng, steps = 20) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let lat = startLat + (endLat - startLat) * t;
    let lng = startLng + (endLng - startLng) * t;
    
    if (i > 0 && i < steps) {
      lat += Math.sin(t * Math.PI * 0.2) * 0.01;
      lng += Math.cos(t * Math.PI * 0.2) * 0.01;
    }
    points.append ? points.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]) : points.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  }
  return points;
}
