/**
 * AI-powered provider recommendations using Claude.
 *
 * Given a user's query and a list of providers, this module
 * uses an LLM to rank and explain the best matches.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ProviderRecommendation {
  providerId: string;
  score: number;       // 0-100
  reason: string;      // one-line explanation
  highlights: string[]; // 2-3 bullet points
}

export async function getAIRecommendations(
  userQuery: string,
  providers: Provider[]
): Promise<ProviderRecommendation[]> {
  if (!providers.length) return [];

  const providerSummaries = providers.map((p) => ({
    id: p.id,
    name: p.businessName,
    category: p.category,
    rating: p.rating,
    reviewCount: p.reviewCount,
    hourlyRate: p.hourlyRate,
    description: p.description,
    city: p.location.city,
    identityVerified: p.identityVerified,
  }));

  const prompt = `You are a recommendation engine for LocalPro, a local services marketplace.

User query: "${userQuery}"

Available providers (JSON):
${JSON.stringify(providerSummaries, null, 2)}

Rank these providers for the user's query. Return a JSON array (no markdown) with this structure:
[
  {
    "providerId": "<id>",
    "score": <0-100>,
    "reason": "<one sentence why this is a good match>",
    "highlights": ["<key point 1>", "<key point 2>"]
  }
]

Rules:
- Consider: match to query intent, rating, price-value ratio, identity verification, review count
- Only return providers that are actually relevant
- Sort by score descending
- Be concise and specific in reasons`;

  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as ProviderRecommendation[];
  } catch {
    console.error("Failed to parse AI recommendations:", text);
    return [];
  }
}

/**
 * Generate a short AI summary for a provider's profile page.
 */
export async function generateProviderSummary(
  provider: Provider
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Write a 2-sentence professional summary for this service provider profile.
Be factual, warm, and highlight their strengths.

Provider: ${provider.businessName}
Category: ${provider.category}
Rating: ${provider.rating}/5 (${provider.reviewCount} reviews)
Rate: $${(provider.hourlyRate / 100).toFixed(0)}/hr
Description: ${provider.description}
Identity verified: ${provider.identityVerified ? "Yes" : "No"}

Return only the summary text, no quotes.`,
      },
    ],
  });

  return message.content[0].type === "text"
    ? message.content[0].text
    : provider.description;
}
