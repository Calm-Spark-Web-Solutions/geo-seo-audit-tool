import type { MetadataRoute } from "next";

// Production app at app.ranklume.io — private dashboard; block all indexing.
// Public marketing SEO lives on ranklume.com (separate project).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
