import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent, getIdentitySession } from "@/lib/stripe";
import { pool } from "@/lib/db";
import type Stripe from "stripe";

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[webhook] Invalid signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ----------------------------------------------------------------
      // Payment succeeded → confirm booking
      // ----------------------------------------------------------------
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.bookingId;

        if (bookingId) {
          await pool.query(
            `UPDATE bookings
             SET status = 'confirmed',
                 stripe_payment_status = 'succeeded',
                 updated_at = NOW()
             WHERE id = $1 AND stripe_payment_intent_id = $2`,
            [bookingId, pi.id]
          );
          console.log(`[webhook] Booking ${bookingId} confirmed`);
        }
        break;
      }

      // ----------------------------------------------------------------
      // Payment failed
      // ----------------------------------------------------------------
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.bookingId;

        if (bookingId) {
          await pool.query(
            `UPDATE bookings
             SET status = 'cancelled',
                 stripe_payment_status = 'failed',
                 cancelled_at = NOW(),
                 cancellation_reason = 'Payment failed',
                 updated_at = NOW()
             WHERE id = $1`,
            [bookingId]
          );
        }
        break;
      }

      // ----------------------------------------------------------------
      // Identity Verification completed
      // ----------------------------------------------------------------
      case "identity.verification_session.verified": {
        const session = event.data.object as Stripe.Identity.VerificationSession;
        const providerId = session.metadata?.providerId;

        if (providerId) {
          await pool.query(
            `UPDATE providers
             SET identity_verified = true,
                 identity_session_id = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [session.id, providerId]
          );
          console.log(`[webhook] Provider ${providerId} identity verified`);
        }
        break;
      }

      case "identity.verification_session.requires_input": {
        const session = event.data.object as Stripe.Identity.VerificationSession;
        const providerId = session.metadata?.providerId;
        // Optionally notify provider their verification needs more info
        console.warn(
          `[webhook] Identity verification needs input for provider ${providerId}:`,
          session.last_error
        );
        break;
      }

      // ----------------------------------------------------------------
      // Stripe Connect: provider onboarding complete
      // ----------------------------------------------------------------
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const chargesEnabled = account.charges_enabled;
        const payoutsEnabled = account.payouts_enabled;

        if (chargesEnabled && payoutsEnabled) {
          await pool.query(
            `UPDATE providers
             SET stripe_account_id = $1, updated_at = NOW()
             WHERE stripe_account_id = $1`,
            [account.id]
          );
          console.log(`[webhook] Provider account ${account.id} fully enabled`);
        }
        break;
      }

      default:
        console.log(`[webhook] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
