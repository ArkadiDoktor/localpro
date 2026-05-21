import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { buildGeoQuery, geocodeAddress } from "@/lib/places";
import { getAIRecommendations } from "@/lib/ai";
import type { Provider, SearchFilters } from "@/types";

const searchSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  address: z.string().optional(), // geocode this if lat/lng not given
  radius: z.coerce.number().default(10), // km
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  date: z.string().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(12),
  useAI: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const filters = searchSchema.parse(params);

    let lat = filters.lat;
    let lng = filters.lng;

    // Geocode address string if coordinates not provided
    if (!lat && !lng && filters.address) {
      const geo = await geocodeAddress(filters.address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    // Build query dynamically
    const conditions: string[] = ["p.is_active = true"];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (filters.category) {
      conditions.push(`p.category = $${paramIdx++}`);
      queryParams.push(filters.category);
    }

    if (filters.maxPrice) {
      conditions.push(`p.hourly_rate <= $${paramIdx++}`);
      queryParams.push(filters.maxPrice * 100); // convert to cents
    }

    if (filters.minRating) {
      conditions.push(`p.rating >= $${paramIdx++}`);
      queryParams.push(filters.minRating);
    }

    // Geo filter
    let distanceSelect = "";
    if (lat && lng) {
      const { whereClause, params: geoParams } = buildGeoQuery(
        lat,
        lng,
        filters.radius
      );
      // Adjust param indices
      const adjustedWhere = whereClause
        .replace("$1", `$${paramIdx}`)
        .replace("$2", `$${paramIdx + 1}`);
      conditions.push(adjustedWhere);
      queryParams.push(...geoParams);
      paramIdx += 2;

      distanceSelect = `, ST_Distance(p.location, ST_GeographyFromText('SRID=4326;POINT(${lng} ${lat})')) / 1000 AS distance_km`;
    }

    // Full text search on business name + description
    if (filters.query) {
      conditions.push(
        `(p.business_name ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`
      );
      queryParams.push(`%${filters.query}%`);
      paramIdx++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const offset = (filters.page - 1) * filters.pageSize;

    const sql = `
      SELECT
        p.*,
        u.name AS user_name,
        u.email AS user_email
        ${distanceSelect}
      FROM providers p
      JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.rating DESC, p.review_count DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM providers p
      ${where}
    `;

    const [rows, countRows] = await Promise.all([
      pool.query(sql, [...queryParams, filters.pageSize, offset]),
      pool.query(countSql, queryParams),
    ]);

    const providers = rows.rows.map(mapProviderRow);
    const total = parseInt(countRows.rows[0]?.total ?? "0");

    // Optional AI ranking
    let aiRecommendations = null;
    if (filters.useAI && filters.query && providers.length > 0) {
      aiRecommendations = await getAIRecommendations(
        filters.query,
        providers
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        providers,
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        hasMore: offset + providers.length < total,
        aiRecommendations,
      },
    });
  } catch (err) {
    console.error("[search] error:", err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid parameters", details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Search failed" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------
// Map DB row → Provider type
// ----------------------------------------------------------------
function mapProviderRow(row: Record<string, unknown>): Provider {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    businessName: row.business_name as string,
    category: row.category as Provider["category"],
    description: row.description as string,
    hourlyRate: row.hourly_rate as number,
    rating: parseFloat(row.rating as string),
    reviewCount: row.review_count as number,
    location: {
      address: row.address as string,
      city: row.city as string,
      lat: parseFloat(row.lat as string),
      lng: parseFloat(row.lng as string),
      placeId: row.place_id as string,
    },
    stripeAccountId: row.stripe_account_id as string | undefined,
    identityVerified: row.identity_verified as boolean,
    availability: row.availability as Provider["availability"],
    images: row.images as string[],
    createdAt: new Date(row.created_at as string),
  };
}
