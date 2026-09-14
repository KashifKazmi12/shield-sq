/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma Client is generated to src/generated/prisma (custom output). Ensure
  // the query engine binaries are included in serverless traces on Vercel.
  outputFileTracingIncludes: {
    "/**/*": ["./src/generated/prisma/**/*"],
  },
};

module.exports = nextConfig;
