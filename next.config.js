/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "maps.googleapis.com",
      "lh3.googleusercontent.com",
    ],
  },
  // Stripe webhooks need raw body
  experimental: {
    serverComponentsExternalPackages: ["pg", "bcryptjs"],
  },
};

module.exports = nextConfig;
