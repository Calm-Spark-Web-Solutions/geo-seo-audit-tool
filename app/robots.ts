import type { MetadataRoute } from "next";

// app.ranklume.io is a private dashboard — block all search engine indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
