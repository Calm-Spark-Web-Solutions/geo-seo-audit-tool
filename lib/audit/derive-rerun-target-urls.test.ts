import { describe, expect, it, vi } from "vitest";

import { deriveRerunTargetUrls } from "./derive-rerun-target-urls";

describe("deriveRerunTargetUrls", () => {
  const website = "https://example.com";

  it("uses target_urls when present", async () => {
    const supabase = {} as never;
    const r = await deriveRerunTargetUrls(supabase, website, {
      id: "a1",
      community_id: "c1",
      target_urls: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/a",
      ],
      shard_urls: ["https://example.com/sitemap.xml"],
      max_pages: 100,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(r.shardUrlsMeta).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("rejects cross-origin target_urls", async () => {
    const supabase = {} as never;
    const r = await deriveRerunTargetUrls(supabase, website, {
      id: "a1",
      community_id: "c1",
      target_urls: ["https://evil.com/x"],
      shard_urls: null,
      max_pages: 10,
    });
    expect(r.ok).toBe(false);
  });

  it("accepts www URLs when community website uses apex host", async () => {
    const supabase = {} as never;
    const r = await deriveRerunTargetUrls(supabase, "https://example.com", {
      id: "a1",
      community_id: "c1",
      target_urls: ["https://www.example.com/about"],
      shard_urls: null,
      max_pages: 10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urls).toEqual(["https://www.example.com/about"]);
  });

  it("loads audit_pages when no target_urls or shards", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { url: "https://example.com/old" },
        { url: "https://example.com/old" },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const r = await deriveRerunTargetUrls(supabase, website, {
      id: "audit-99",
      community_id: "c1",
      target_urls: null,
      shard_urls: null,
      max_pages: 50,
    });

    expect(from).toHaveBeenCalledWith("audit_pages");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urls).toEqual(["https://example.com/old"]);
    expect(r.shardUrlsMeta).toBeNull();
  });
});
