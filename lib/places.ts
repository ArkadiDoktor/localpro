const PLACES_API_BASE = "https://maps.googleapis.com/maps/api/place";
const GEOCODE_API_BASE = "https://maps.googleapis.com/maps/api/geocode";
const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

export interface PlaceAutocompleteResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  photos: string[]; // photo URLs
}

export interface NearbyProvider {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  distance?: number; // km
}

// ----------------------------------------------------------------
// Autocomplete — for address input in booking form
// ----------------------------------------------------------------
export async function autocompleteAddress(
  input: string,
  sessionToken?: string
): Promise<PlaceAutocompleteResult[]> {
  const params = new URLSearchParams({
    input,
    key: API_KEY,
    types: "address",
    ...(sessionToken ? { sessiontoken: sessionToken } : {}),
  });

  const res = await fetch(`${PLACES_API_BASE}/autocomplete/json?${params}`);
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Places API error: ${data.status}`);
  }

  return (data.predictions ?? []).map((p: PlacePrediction) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? "",
  }));
}

// ----------------------------------------------------------------
// Get full details for a place by ID
// ----------------------------------------------------------------
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields:
      "place_id,name,formatted_address,geometry,international_phone_number,website,rating,photos",
    key: API_KEY,
  });

  const res = await fetch(`${PLACES_API_BASE}/details/json?${params}`);
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(`Place Details error: ${data.status}`);
  }

  const r = data.result;
  const addressComponents: AddressComponent[] = r.address_components ?? [];

  const city =
    addressComponents.find((c) => c.types.includes("locality"))?.long_name ??
    addressComponents.find((c) =>
      c.types.includes("administrative_area_level_1")
    )?.long_name ??
    "";

  const country =
    addressComponents.find((c) => c.types.includes("country"))?.short_name ??
    "";

  const photos: string[] = (r.photos ?? [])
    .slice(0, 5)
    .map((p: PlacePhoto) =>
      `${PLACES_API_BASE}/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${API_KEY}`
    );

  return {
    placeId: r.place_id,
    name: r.name,
    formattedAddress: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    city,
    country,
    phoneNumber: r.international_phone_number,
    website: r.website,
    rating: r.rating,
    photos,
  };
}

// ----------------------------------------------------------------
// Geocode a free-text address → lat/lng
// ----------------------------------------------------------------
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const params = new URLSearchParams({ address, key: API_KEY });
  const res = await fetch(`${GEOCODE_API_BASE}/json?${params}`);
  const data = await res.json();

  if (data.status !== "OK" || !data.results.length) return null;

  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
  };
}

// ----------------------------------------------------------------
// Find providers near a location (using our DB, not Places)
// This is a helper to build the geo query string for PostGIS
// ----------------------------------------------------------------
export function buildGeoQuery(
  lat: number,
  lng: number,
  radiusKm: number
): { whereClause: string; params: unknown[] } {
  // PostGIS: ST_DWithin with geography uses meters
  return {
    whereClause: `ST_DWithin(p.location, ST_GeographyFromText($1), $2)`,
    params: [`SRID=4326;POINT(${lng} ${lat})`, radiusKm * 1000],
  };
}

// ----------------------------------------------------------------
// Types (internal, from Google API shape)
// ----------------------------------------------------------------
interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface PlacePhoto {
  photo_reference: string;
  height: number;
  width: number;
}
