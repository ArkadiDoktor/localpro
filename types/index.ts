// Core domain types for LocalPro

export interface User {
  id: string;
  email: string;
  name: string;
  role: "client" | "provider" | "admin";
  stripeCustomerId?: string;
  createdAt: Date;
}

export interface Provider {
  id: string;
  userId: string;
  businessName: string;
  category: ServiceCategory;
  description: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  location: {
    address: string;
    city: string;
    lat: number;
    lng: number;
    placeId: string; // Google Places ID
  };
  stripeAccountId?: string;
  identityVerified: boolean; // Stripe Identity
  availability: WeeklyAvailability;
  images: string[];
  createdAt: Date;
}

export interface Booking {
  id: string;
  clientId: string;
  providerId: string;
  serviceDate: Date;
  startTime: string; // "09:00"
  endTime: string;   // "11:00"
  hours: number;
  totalAmount: number; // in cents
  status: BookingStatus;
  notes?: string;
  address: string;
  stripePaymentIntentId?: string;
  stripePaymentStatus?: "pending" | "succeeded" | "failed";
  createdAt: Date;
  updatedAt: Date;
  // joined
  provider?: Provider;
  client?: User;
}

export interface Review {
  id: string;
  bookingId: string;
  clientId: string;
  providerId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Date;
}

export type ServiceCategory =
  | "plumber"
  | "electrician"
  | "cleaner"
  | "carpenter"
  | "painter"
  | "gardener"
  | "locksmith"
  | "ac_technician";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "refunded";

export type WeeklyAvailability = {
  [day in "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"]: {
    available: boolean;
    slots: string[]; // ["09:00", "10:00", ...]
  };
};

// API response wrappers
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export interface SearchFilters {
  query?: string;
  category?: ServiceCategory;
  lat?: number;
  lng?: number;
  radius?: number; // km
  maxPrice?: number;
  minRating?: number;
  date?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
