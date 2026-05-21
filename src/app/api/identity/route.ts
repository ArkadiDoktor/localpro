import { NextRequest, NextResponse } from "next/server";
import {
  createIdentityVerificationSession,
  getIdentitySession,
} from "@/lib/stripe";
import { pool, queryOne } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

// POST /api/identity — start a new verification session
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Find the user's provider profile
  const provider = await queryOne<{ id: string; identity_verified: boolean }>(
    `SELECT id, identity_verified FROM providers WHERE user_id = $1`,
    [user.id]
  );

  if (!provider) {
    return NextResponse.json(
      { success: false, error: "Provider profile not found" },
      { status: 404 }
    );
  }

  if (provider.identity_verified) {
    return NextResponse.json({
      success: true,
      data: { alreadyVerified: true },
    });
  }

  const returnUrl = `${APP_URL}/providers/onboarding/identity-return`;

  const session = await createIdentityVerificationSession(
    provider.id,
    returnUrl
  );

  // Store session ID so we can check status later
  await pool.query(
    `UPDATE providers SET identity_session_id = $1 WHERE id = $2`,
    [session.id, provider.id]
  );

  return NextResponse.json({
    success: true,
    data: {
      clientSecret: session.client_secret,
      sessionId: session.id,
    },
  });
}

// GET /api/identity?sessionId=vs_xxx — check verification status
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId required" },
      { status: 400 }
    );
  }

  const session = await getIdentitySession(sessionId);

  // Sync status to DB if verified
  if (session.status === "verified") {
    await pool.query(
      `UPDATE providers
       SET identity_verified = true, updated_at = NOW()
       WHERE identity_session_id = $1`,
      [sessionId]
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      status: session.status, // "requires_input" | "processing" | "verified" | "canceled"
      lastError: session.last_error,
    },
  });
}
