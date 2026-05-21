-- LocalPro Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- for geo queries

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'provider', 'admin')),
  stripe_customer_id VARCHAR(255),
  avatar_url    TEXT,
  phone         VARCHAR(30),
  email_verified BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- PROVIDERS
-- ============================================================
CREATE TABLE providers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name       VARCHAR(255) NOT NULL,
  category            VARCHAR(50) NOT NULL,
  description         TEXT,
  hourly_rate         INTEGER NOT NULL, -- in cents
  rating              DECIMAL(3,2) DEFAULT 0,
  review_count        INTEGER DEFAULT 0,

  -- Location (Google Places)
  address             TEXT NOT NULL,
  city                VARCHAR(100) NOT NULL,
  place_id            VARCHAR(255),      -- Google Places ID
  lat                 DECIMAL(10,7),
  lng                 DECIMAL(10,7),
  location            GEOGRAPHY(POINT),  -- PostGIS for geo queries

  -- Stripe
  stripe_account_id   VARCHAR(255),      -- Connected account for payouts
  identity_verified   BOOLEAN DEFAULT false,
  identity_session_id VARCHAR(255),      -- Stripe Identity session

  -- Media
  images              TEXT[] DEFAULT '{}',

  -- Availability (JSON)
  availability        JSONB NOT NULL DEFAULT '{
    "mon": {"available": true,  "slots": ["09:00","10:00","11:00","14:00","15:00","16:00"]},
    "tue": {"available": true,  "slots": ["09:00","10:00","11:00","14:00","15:00","16:00"]},
    "wed": {"available": true,  "slots": ["09:00","10:00","11:00","14:00","15:00","16:00"]},
    "thu": {"available": true,  "slots": ["09:00","10:00","11:00","14:00","15:00","16:00"]},
    "fri": {"available": true,  "slots": ["09:00","10:00","11:00","14:00","15:00"]},
    "sat": {"available": false, "slots": []},
    "sun": {"available": false, "slots": []}
  }',

  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_category   ON providers(category);
CREATE INDEX idx_providers_city       ON providers(city);
CREATE INDEX idx_providers_location   ON providers USING GIST(location);
CREATE INDEX idx_providers_user_id    ON providers(user_id);
CREATE INDEX idx_providers_rating     ON providers(rating DESC);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE bookings (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id                UUID NOT NULL REFERENCES users(id),
  provider_id              UUID NOT NULL REFERENCES providers(id),

  service_date             DATE NOT NULL,
  start_time               TIME NOT NULL,
  end_time                 TIME NOT NULL,
  hours                    DECIMAL(4,2) NOT NULL,

  total_amount             INTEGER NOT NULL, -- in cents (hourly_rate * hours)
  platform_fee             INTEGER NOT NULL, -- 15% platform cut
  provider_payout          INTEGER NOT NULL, -- total_amount - platform_fee

  status                   VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','refunded')),

  notes                    TEXT,
  service_address          TEXT NOT NULL,

  -- Stripe Payment
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_payment_status    VARCHAR(30),
  stripe_transfer_id       VARCHAR(255), -- payout to provider

  -- Cancellation
  cancelled_at             TIMESTAMPTZ,
  cancellation_reason      TEXT,
  refund_id                VARCHAR(255),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_client_id   ON bookings(client_id);
CREATE INDEX idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX idx_bookings_status      ON bookings(status);
CREATE INDEX idx_bookings_date        ON bookings(service_date);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL UNIQUE REFERENCES bookings(id),
  client_id    UUID NOT NULL REFERENCES users(id),
  provider_id  UUID NOT NULL REFERENCES providers(id),
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_provider_id ON reviews(provider_id);

-- Trigger: auto-update provider rating after review
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE providers
  SET
    rating       = (SELECT AVG(rating)   FROM reviews WHERE provider_id = NEW.provider_id),
    review_count = (SELECT COUNT(*)      FROM reviews WHERE provider_id = NEW.provider_id),
    updated_at   = NOW()
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_provider_rating
AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_provider_rating();

-- ============================================================
-- EMAIL LOG (audit trail for transactional emails)
-- ============================================================
CREATE TABLE email_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient    VARCHAR(255) NOT NULL,
  template     VARCHAR(100) NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  reference_id UUID,   -- booking_id or user_id
  provider     VARCHAR(50) DEFAULT 'sendgrid',
  message_id   VARCHAR(255), -- returned by SendGrid
  status       VARCHAR(30) DEFAULT 'sent',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT trigger for all tables
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_providers_updated_at BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated_at  BEFORE UPDATE ON bookings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
