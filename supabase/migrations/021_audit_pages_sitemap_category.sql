-- Per-row sitemap shard category label (e.g. Pages, Posts) for grouping in audit UI.
alter table audit_pages
  add column if not exists sitemap_category_label text;
