import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
  typescript: true,
});

const PLATFORM_FEE_PERCENT = 0.15; // 15%

// ----------------------------------------------------------------
// PAYMENTS
// ----------------------------------------------------------------

/**
 * Create a PaymentIntent for a booking.
 * The charge is captured immediately; payout to provider is via Transfer.
 */
export async function createBookingPaymentIntent({
  bookingId,
  totalAmountCents,
  providerStripeAccountId,
  customerEmail,
}: {
  bookingId: string;
  totalAmountCents: number;
  providerStripeAccountId: string;
  customerEmail: string;
}) {
  const platformFeeCents = Math.round(totalAmountCents * PLATFORM_FEE_PERCENT);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalAmountCents,
    currency: "usd",
    receipt_email: customerEmail,
    metadata: { bookingId, platform: "localpro" },
    // Stripe Connect: transfer to provider after capture
    transfer_data: {
      destination: providerStripeAccountId,
    },
    application_fee_amount: platformFeeCents,
    automatic_payment_methods: { enabled: true },
  });

  return paymentIntent;
}

/**
 * Retrieve a PaymentIntent to confirm its status.
 */
export async function getPaymentIntent(id: string) {
  return stripe.paymentIntents.retrieve(id);
}

/**
 * Issue a full or partial refund on a PaymentIntent.
 */
export async function refundPayment(
  paymentIntentId: string,
  amountCents?: number
) {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amountCents ? { amount: amountCents } : {}),
  });
}

// ----------------------------------------------------------------
// STRIPE CONNECT (Provider onboarding)
// ----------------------------------------------------------------

/**
 * Create a Stripe Express connected account for a provider.
 */
export async function createProviderConnectedAccount(email: string) {
  return stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
  });
}

/**
 * Generate an onboarding link for a provider to complete their Stripe setup.
 */
export async function createOnboardingLink(accountId: string, origin: string) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/providers/onboarding/refresh`,
    return_url: `${origin}/providers/onboarding/complete`,
    type: "account_onboarding",
  });
}

// ----------------------------------------------------------------
// STRIPE IDENTITY (Provider verification)
// ----------------------------------------------------------------

/**
 * Create an Identity Verification Session for a provider.
 * Returns a client_secret the frontend uses to launch the Stripe Identity modal.
 */
export async function createIdentityVerificationSession(
  providerId: string,
  returnUrl: string
) {
  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { providerId },
    options: {
      document: {
        allowed_types: ["driving_license", "passport", "id_card"],
        require_id_number: false,
        require_live_capture: true,
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
  });

  return session;
}

/**
 * Retrieve the status of an Identity Verification Session.
 */
export async function getIdentitySession(sessionId: string) {
  return stripe.identity.verificationSessions.retrieve(sessionId);
}

// ----------------------------------------------------------------
// WEBHOOKS
// ----------------------------------------------------------------

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export type { Stripe };
