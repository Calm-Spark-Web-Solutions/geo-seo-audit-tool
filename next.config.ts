import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer relies on Node-only deps (yoga-layout, fontkit, …)
  // and bundling it through Turbopack at request time produces
  // "ba.Component is not a constructor" errors. Marking it external pins it
  // to runtime require(), which is what the library expects.
  serverExternalPackages: ["@react-pdf/renderer"],
};

// Toggle the analyzer with `ANALYZE=1 npm run analyze`. The wrapper is a
// no-op when the env var is unset, so prod builds are unaffected.
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "1",
});

export default bundleAnalyzer(nextConfig);
