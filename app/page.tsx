import Link from "next/link";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background px-6 py-12 text-center">
      <Brand size="lg" />

      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          AI-powered SEO &amp; GEO audits for senior living websites.
        </h1>
        <p className="text-muted-foreground">
          Crawl every page, score SEO and Generative Engine Optimization, and
          ship a branded report your operators will actually read.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button variant="outline" asChild size="lg">
          <Link href="/signup">Create account</Link>
        </Button>
      </div>
    </div>
  );
}
