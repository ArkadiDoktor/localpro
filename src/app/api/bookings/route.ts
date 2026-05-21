import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction, queryOne } from "@/lib/db";
import { createBookingPaymentIntent } from "@/lib/stripe";
import {
  sendBookingConfirmation,
  sendProviderBookingNotification,
} from "@/lib/email";
import { getAuthUser } from "@/lib/auth";
import type { Booking, Provider, User } from "@/types";

const PLATFORM_FEE = 0.15;

const createBookingSchema = z.object({
  providerId: z.string().uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.number().min(1).max(8),
  serviceAddress: z.string().min(5),
  notes: z.string().max(500).optional(),
});

// ----------------------------------------------------------------
// POST /api/bookings — create a new booking + payment intent
// ----------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const input = createBookingSchema.parse(body);

    // Load provider
    const provider = await queryOne<
      Provider & { user_email: string; user_name: string; stripe_account_id: string }
    >(
      `SELECT p.*, u.email AS user_email, u.name AS user_name
       FROM providers p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND p.is_active = true`,
      [input.providerId]
    );

    if (!provider) {
      return NextResponse.json({ success: false, error: "Provider not found" }, { status: 404 });
    }

    if (!provider.stripe_account_id) {
      return NextResponse.json(
        { success: false, error: "Provider has not completed payment setup" },
        { status: 422 }
      );
    }

    // Calculate amounts
    const totalAmountCents = Math.round(
      (provider as unknown as { hourly_rate: number }).hourly_rate * input.hours
    );
    const platformFeeCents = Math.round(totalAmountCents * PLATFORM_FEE);
    const providerPayoutCents = totalAmountCents - platformFeeCents;

    // Calculate end time
    const [hh, mm] = input.startTime.split(":").map(Number);
    const endMinutes = hh * 60 + mm + input.hours * 60;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Wrap DB insert + Stripe creation in a transaction
    const result = await withTransaction(async (client) => {
      // Insert booking record
      const bookingRow = await client.query(
        `INSERT INTO bookings
          (client_id, provider_id, service_date, start_time, end_time, hours,
           total_amount, platform_fee, provider_payout, status, service_address, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11)
         RETURNING *`,
        [
          user.id,
          input.providerId,
          input.serviceDate,
          input.startTime,
          endTime,
          input.hours,
          totalAmountCents,
          platformFeeCents,
          providerPayoutCents,
          input.serviceAddress,
          input.notes ?? null,
        ]
      );
      const booking = bookingRow.rows[0];

      // Create Stripe PaymentIntent
      const paymentIntent = await createBookingPaymentIntent({
        bookingId: booking.id,
        totalAmountCents,
        providerStripeAccountId: provider.stripe_account_id,
        customerEmail: user.email,
      });

      // Store PaymentIntent ID
      await client.query(
        `UPDATE bookings
         SET stripe_payment_intent_id = $1, stripe_payment_status = 'pending'
         WHERE id = $2`,
        [paymentIntent.id, booking.id]
      );

      return { booking, clientSecret: paymentIntent.client_secret };
    });

    // Send emails (fire-and-forget; don't block response)
    const dateFormatted = new Date(input.serviceDate).toLocaleDateString(
      "en-US",
      { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    );

    sendBookingConfirmation(
      {
        clientName: user.name,
        clientEmail: user.email,
        providerName: (provider as unknown as { business_name: string }).business_name,
        serviceDate: dateFormatted,
        startTime: input.startTime,
        endTime,
        address: input.serviceAddress,
        totalAmount: `$${(totalAmountCents / 100).toFixed(2)}`,
        bookingId: result.booking.id,
      },
      result.booking.id
    ).catch(console.error);

    sendProviderBookingNotification(
      {
        providerName: (provider as unknown as { business_name: string }).business_name,
        providerEmail: (provider as unknown as { user_email: string }).user_email,
        clientName: user.name,
        serviceDate: dateFormatted,
        startTime: input.startTime,
        endTime,
        address: input.serviceAddress,
        notes: input.notes,
        payout: `$${(providerPayoutCents / 100).toFixed(2)}`,
      },
      result.booking.id
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        bookingId: result.booking.id,
        clientSecret: result.clientSecret,
        totalAmount: totalAmountCents,
      },
    });
  } catch (err) {
    console.error("[bookings POST]", err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to create booking" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------
// GET /api/bookings — list current user's bookings
// ----------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const role = searchParams.get("role") ?? "client"; // "client" or "provider"
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const conditions =
    role === "provider"
      ? ["p.user_id = $1"]
      : ["b.client_id = $1"];

  const params: unknown[] = [user.id];
  let idx = 2;

  if (status) {
    conditions.push(`b.status = $${idx++}`);
    params.push(status);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      b.*,
      prov.business_name, prov.category, prov.hourly_rate,
      prov.rating AS provider_rating,
      pu.name AS provider_user_name,
      cu.name AS client_name
    FROM bookings b
    JOIN providers prov ON prov.id = b.provider_id
    JOIN users pu ON pu.id = prov.user_id
    JOIN users cu ON cu.id = b.client_id
    ${where}
    ORDER BY b.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const { rows } = await (await import("@/lib/db")).pool.query(sql, [
    ...params,
    pageSize,
    offset,
  ]);

  return NextResponse.json({ success: true, data: rows });
}
