"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin } from "lucide-react";

interface AddressSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (placeId: string, address: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  error?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Enter address…",
  className = "",
  label,
  error,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (input.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams({ input, sessionToken });
        const res = await fetch(`/api/places?${params}`);
        const data = await res.json();

        if (data.success) {
          setSuggestions(data.data);
          setIsOpen(data.data.length > 0);
        }
      } catch {
        console.error("Autocomplete error");
      } finally {
        setIsLoading(false);
      }
    },
    [sessionToken]
  );

  // Debounce input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  // Select a suggestion
  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.description);
    setSuggestions([]);
    setIsOpen(false);
    onPlaceSelect?.(suggestion.placeId, suggestion.description);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`
            w-full rounded-xl border pl-10 pr-10 py-3 text-sm
            text-slate-900 placeholder-slate-400 bg-white
            focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent
            transition-shadow
            ${error
              ? "border-red-300 focus:ring-red-500"
              : "border-slate-200 hover:border-slate-300"
            }
          `}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          className="
            absolute z-50 mt-1 w-full rounded-xl bg-white
            border border-slate-200 shadow-lg py-1.5 overflow-hidden
          "
        >
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="
                  w-full text-left px-4 py-3 flex items-start gap-3
                  hover:bg-slate-50 transition-colors
                "
              >
                <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {s.mainText}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {s.secondaryText}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
