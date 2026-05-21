"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { ProviderCard } from "@/components/provider/ProviderCard";
import type { Provider } from "@/types";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "plumber", label: "🔧 Plumber" },
  { value: "electrician", label: "⚡ Electrician" },
  { value: "cleaner", label: "🧹 Cleaner" },
  { value: "carpenter", label: "🪚 Carpenter" },
  { value: "painter", label: "🎨 Painter" },
  { value: "gardener", label: "🌿 Gardener" },
  { value: "locksmith", label: "🔑 Locksmith" },
  { value: "ac_technician", label: "❄️ A/C Tech" },
];

interface AIRec {
  providerId: string;
  score: number;
  reason: string;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [address, setAddress] = useState(searchParams.get("address") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [useAI, setUseAI] = useState(false);
  const [minRating, setMinRating] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [providers, setProviders] = useState<Provider[]>([]);
  const [aiRecs, setAiRecs] = useState<AIRec[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (address) params.set("address", address);
    if (category) params.set("category", category);
    if (minRating) params.set("minRating", minRating);
    if (maxPrice) params.set("maxPrice", (parseFloat(maxPrice) * 100).toString());
    if (useAI) params.set("useAI", "true");

    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();

      if (data.success) {
        setProviders(data.data.providers);
        setTotal(data.data.total);
        setAiRecs(data.data.aiRecommendations ?? []);

        // Sort by AI score if available
        if (data.data.aiRecommendations?.length > 0) {
          const scoreMap = new Map<string, AIRec>(
            data.data.aiRecommendations.map((r: AIRec) => [r.providerId, r])
          );
          setProviders(
            [...data.data.providers].sort((a, b) => {
              const sa = scoreMap.get(a.id)?.score ?? 0;
              const sb = scoreMap.get(b.id)?.score ?? 0;
              return sb - sa;
            })
          );
        }
      } else {
        setError(data.error);
      }
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aiRecMap = new Map(aiRecs.map((r) => [r.providerId, r]));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Search header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Keyword search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="e.g. fix leaking pipe"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200
                           text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Location */}
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              placeholder="Your location"
              className="flex-1 min-w-48"
            />

            {/* Category filter */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* AI toggle */}
            <button
              onClick={() => setUseAI((v) => !v)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors
                ${useAI
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
            >
              <Sparkles className="h-4 w-4" />
              AI Rank
            </button>

            {/* Search button */}
            <button
              onClick={search}
              className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold
                         text-sm hover:bg-slate-800 transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-600">
            {loading ? "Searching…" : `${total} providers found`}
            {useAI && aiRecs.length > 0 && (
              <span className="ml-2 text-indigo-600 font-medium">
                · AI ranked
              </span>
            )}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
                <div className="h-44 bg-slate-200" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grid */}
        {!loading && providers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {providers.map((p) => {
              const rec = aiRecMap.get(p.id);
              return (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  aiScore={rec?.score}
                  aiReason={rec?.reason}
                />
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && providers.length === 0 && !error && (
          <div className="text-center py-20 text-slate-500">
            <p className="text-4xl mb-4">🔍</p>
            <p className="font-medium text-slate-700">No providers found</p>
            <p className="text-sm mt-1">Try adjusting your filters or location.</p>
          </div>
        )}
      </main>
    </div>
  );
}
