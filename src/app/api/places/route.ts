import { NextRequest, NextResponse } from "next/server";
import { autocompleteAddress, getPlaceDetails } from "@/lib/places";

// GET /api/places/autocomplete?input=...&sessionToken=...
export async function GET(req: NextRequest) {
  const { searchParams, pathname } = req.nextUrl;

  if (pathname.endsWith("/details")) {
    const placeId = searchParams.get("placeId");
    if (!placeId) {
      return NextResponse.json(
        { success: false, error: "placeId required" },
        { status: 400 }
      );
    }
    try {
      const details = await getPlaceDetails(placeId);
      return NextResponse.json({ success: true, data: details });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch place details" },
        { status: 500 }
      );
    }
  }

  // Autocomplete
  const input = searchParams.get("input");
  if (!input || input.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const results = await autocompleteAddress(
      input,
      searchParams.get("sessionToken") ?? undefined
    );
    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Autocomplete failed" },
      { status: 500 }
    );
  }
}
