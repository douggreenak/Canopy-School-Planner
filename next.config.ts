import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min'],
  ...(process.env.NODE_ENV === 'development' ? {
    allowedDevOrigins: [
      '192.168.1.15',
      '192.168.1.*',
      '10.0.0.*',
      '*.local',
    ],
  } : {}),
};

export default nextConfig;
