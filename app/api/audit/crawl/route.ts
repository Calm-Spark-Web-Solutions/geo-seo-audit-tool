import { NextResponse } from "next/server";

import { crawlSite } from "@/lib/crawler/crawl";
import { fetchSitemap } from "@/lib/crawler/sitemap";
import { normalizeUrl } from "@/lib/crawler/normalize";
import { createClient } from "@/lib/supabase/server";
import type { CrawlResult } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CrawlRequestBody {
  url?: string;
  communityId?: string;
}

export async function POST(request: Request) {
  let body: CrawlRequestBody;
  try {
    body = (await request.json()) as CrawlRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let target: string | null = null;

  if (body.communityId) {
    const { data: community, error } = await supabase
      .from("communities")
      .select("website_url")
      .eq("id", body.communityId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!community) {
      // RLS will hide rows the user can't see, surfacing as null.
      return NextResponse.json(
        { error: "Community not found or access denied" },
        { status: 403 },
      );
    }
    target = normalizeUrl(community.website_url);
  } else if (body.url) {
    target = normalizeUrl(body.url);
  }

  if (!target) {
    return NextResponse.json(
      { error: "Provide a valid `url` or `communityId`" },
      { status: 400 },
    );
  }

  const sitemapUrls = await fetchSitemap(target);
  if (sitemapUrls.length > 0) {
    const result: CrawlResult = { urls: sitemapUrls, source: "sitemap" };
    return NextResponse.json(result);
  }

  const crawled = await crawlSite(target);
  const result: CrawlResult = { urls: crawled, source: "crawl" };
  return NextResponse.json(result);
}
