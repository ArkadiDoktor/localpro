import Link from "next/link";
import { Star, MapPin, Clock, ShieldCheck } from "lucide-react";
import type { Provider } from "@/types";

const CATEGORY_LABELS: Record<Provider["category"], string> = {
  plumber: "Plumber",
  electrician: "Electrician",
  cleaner: "Cleaner",
  carpenter: "Carpenter",
  painter: "Painter",
  gardener: "Gardener",
  locksmith: "Locksmith",
  ac_technician: "A/C Technician",
};

interface ProviderCardProps {
  provider: Provider & { distanceKm?: number };
  aiScore?: number;
  aiReason?: string;
}

export function ProviderCard({ provider, aiScore, aiReason }: ProviderCardProps) {
  return (
    <Link
      href={`/providers/${provider.id}`}
      className="group block bg-white rounded-2xl border border-slate-200
                 hover:border-slate-300 hover:shadow-md transition-all duration-200"
    >
      {/* Image */}
      <div className="relative h-44 rounded-t-2xl overflow-hidden bg-slate-100">
        {provider.images[0] ? (
          <img
            src={provider.images[0]}
            alt={provider.businessName}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span className="text-4xl">🔧</span>
          </div>
        )}

        {/* Category badge */}
        <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm
                         text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
          {CATEGORY_LABELS[provider.category]}
        </span>

        {/* Identity verified badge */}
        {provider.identityVerified && (
          <span className="absolute top-3 right-3 bg-emerald-500 text-white
                           text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Verified
          </span>
        )}

        {/* AI score badge */}
        {aiScore !== undefined && (
          <span className="absolute bottom-3 right-3 bg-slate-900/90 text-white
                           text-xs font-bold px-2.5 py-1 rounded-full">
            AI Match {aiScore}%
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900 text-base leading-tight group-hover:text-slate-700">
            {provider.businessName}
          </h3>
          <div className="flex items-center gap-1 shrink-0 text-sm">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-slate-900">
              {provider.rating.toFixed(1)}
            </span>
            <span className="text-slate-400">({provider.reviewCount})</span>
          </div>
        </div>

        {/* Location */}
        <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>{provider.location.city}</span>
          {provider.distanceKm !== undefined && (
            <span className="ml-1 text-slate-400">
              · {provider.distanceKm.toFixed(1)} km away
            </span>
          )}
        </div>

        {/* Description */}
        <p className="mt-2 text-sm text-slate-600 line-clamp-2">
          {provider.description}
        </p>

        {/* AI reason */}
        {aiReason && (
          <p className="mt-2 text-xs text-indigo-600 bg-indigo-50 rounded-lg px-2.5 py-1.5 line-clamp-2">
            ✨ {aiReason}
          </p>
        )}

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>Available today</span>
          </div>
          <span className="font-bold text-slate-900 text-base">
            ${(provider.hourlyRate / 100).toFixed(0)}
            <span className="text-sm font-normal text-slate-500">/hr</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
