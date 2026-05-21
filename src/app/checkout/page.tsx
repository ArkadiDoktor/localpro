"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useRouter, useSearchParams } from "next/navigation";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ----------------------------------------------------------------
// Inner form (must be inside <Elements>)
// ----------------------------------------------------------------
function CheckoutForm({
  bookingId,
  totalAmount,
}: {
  bookingId: string;
  totalAmount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/bookings/${bookingId}/success`,
      },
    });

    if (error) {
      setErrorMessage(error.message ?? "Payment failed. Please try again.");
      setIsProcessing(false);
    }
    // On success, Stripe redirects to return_url
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />

      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full rounded-xl bg-slate-900 py-4 text-white font-semibold
                   text-base tracking-wide transition-all
                   hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Processing…
          </span>
        ) : (
          `Pay $${(totalAmount / 100).toFixed(2)}`
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        Secured by Stripe · Your card details are never stored
      </p>
    </form>
  );
}

// ----------------------------------------------------------------
// Page wrapper — fetches client secret, renders Elements
// ----------------------------------------------------------------
export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId") ?? "";

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) {
      setError("No booking ID provided.");
      setLoading(false);
      return;
    }

    // The client secret was already created when the booking was made;
    // retrieve it from session storage (set by the booking flow page).
    const stored = sessionStorage.getItem(`booking_${bookingId}`);
    if (stored) {
      const { clientSecret: cs, totalAmount: ta } = JSON.parse(stored);
      setClientSecret(cs);
      setTotalAmount(ta);
      setLoading(false);
    } else {
      setError("Booking session expired. Please start over.");
      setLoading(false);
    }
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error ?? "Something went wrong."}</p>
          <a href="/search" className="mt-4 inline-block text-sm text-slate-600 underline">
            Back to search
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Complete Payment</h1>
          <p className="text-slate-500 text-sm mt-1">
            Booking #{bookingId.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#0f172a",
                borderRadius: "10px",
                fontFamily: "system-ui, sans-serif",
              },
            },
          }}
        >
          <CheckoutForm bookingId={bookingId} totalAmount={totalAmount} />
        </Elements>
      </div>
    </div>
  );
}
