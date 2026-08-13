import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Linting runs standalone via `pnpm lint` (shared @masalim/config flat config);
  // Next's built-in lint step expects eslint-config-next which we deliberately skip.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
