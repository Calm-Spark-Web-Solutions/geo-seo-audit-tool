import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer relies on Node-only deps (yoga-layout, fontkit, …)
  // and bundling it through Turbopack at request time produces
  // "ba.Component is not a constructor" errors. Marking it external pins it
  // to runtime require(), which is what the library expects.
  serverExternalPackages: ["@react-pdf/renderer"],
  async redirects() {
    return [
      {
        source: "/audits/:path*",
        destination: "/visibility-scans/:path*",
        permanent: true,
      },
      {
        source: "/api/audits/:path*",
        destination: "/api/visibility-scans/:path*",
        permanent: true,
      },
      {
        source: "/communities/:id/new-audit",
        destination: "/communities/:id/new-visibility-scan",
        permanent: true,
      },
    ];
  },
};

// Toggle the analyzer with `ANALYZE=1 npm run analyze`. The wrapper is a
// no-op when the env var is unset, so prod builds are unaffected.
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "1",
});

export default withSentryConfig(bundleAnalyzer(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "ranklume",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
