import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:dns BEFORE importing the module under test so the import
// resolves to the mocked version. The mock returns a writable spy that
// individual tests reconfigure per case.
vi.mock("node:dns", () => {
  return {
    promises: {
      lookup: vi.fn(),
    },
  };
});

import { promises as dns } from "node:dns";

import { SsrfBlockedError, assertSafeUrl, isSafeUrl } from "./ssrf";

const lookupMock = dns.lookup as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Default: pretend the hostname resolves to a public IP. Tests that
  // care about the resolution path override this in-place.
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertSafeUrl: protocol and parse rejection", () => {
  it("rejects unsupported protocols", async () => {
    await expect(assertSafeUrl("ftp://example.com/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    await expect(assertSafeUrl("javascript:alert(1)")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});

describe("assertSafeUrl: blocked hostname literals", () => {
  it.each([
    "localhost",
    "metadata.google.internal",
    "metadata.azure.com",
    "metadata",
  ])("rejects hostname %s", async (host) => {
    await expect(assertSafeUrl(`http://${host}/x`)).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});

describe("assertSafeUrl: IPv4 literal blocklist", () => {
  // One representative literal per CIDR in lib/security/ssrf.ts. If a new
  // range is added, add a row here.
  it.each([
    ["0.0.0.0/8", "0.0.0.0"],
    ["10.0.0.0/8", "10.1.2.3"],
    ["100.64.0.0/10", "100.64.0.1"],
    ["127.0.0.0/8", "127.0.0.1"],
    ["169.254.0.0/16 (cloud metadata)", "169.254.169.254"],
    ["172.16.0.0/12", "172.20.0.1"],
    ["192.0.0.0/24", "192.0.0.1"],
    ["192.168.0.0/16", "192.168.1.1"],
    ["198.18.0.0/15", "198.18.0.1"],
    ["multicast 224.0.0.0/4", "224.0.0.1"],
    ["reserved 240.0.0.0/4", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
  ])("rejects %s literal %s", async (_range, ip) => {
    await expect(assertSafeUrl(`http://${ip}/`)).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    // No DNS should be needed for IP literals.
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("accepts public IPv4 literals", async () => {
    const url = await assertSafeUrl("http://93.184.216.34/");
    expect(url.host).toBe("93.184.216.34");
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("assertSafeUrl: IPv6 literal blocklist", () => {
  it("rejects IPv6 loopback", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("rejects link-local fe80::/10", async () => {
    await expect(
      assertSafeUrl("http://[fe80::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects unique-local fc00::/7", async () => {
    await expect(
      assertSafeUrl("http://[fc00::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertSafeUrl("http://[fd12:3456:789a::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects multicast ff00::/8", async () => {
    await expect(
      assertSafeUrl("http://[ff02::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects IPv4-mapped IPv6 of private ranges", async () => {
    await expect(
      assertSafeUrl("http://[::ffff:127.0.0.1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertSafeUrl("http://[::ffff:169.254.169.254]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("accepts a public IPv6 literal", async () => {
    const url = await assertSafeUrl("http://[2606:4700:4700::1111]/");
    expect(url.protocol).toBe("http:");
  });
});

describe("assertSafeUrl: DNS-resolved hostname", () => {
  it("rejects when DNS resolves the hostname to a private IP", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      assertSafeUrl("http://attacker.example/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(lookupMock).toHaveBeenCalledOnce();
  });

  it("rejects on a single private record even when others are public", async () => {
    // Hostile DNS returns mixed records to bypass naive checks. We must
    // reject if ANY record is unsafe.
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ]);
    await expect(
      assertSafeUrl("http://mixed.example/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects IPv6 records that resolve to link-local", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "fe80::1", family: 6 },
    ]);
    await expect(
      assertSafeUrl("http://v6attacker.example/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("accepts hostnames that resolve to public addresses", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);
    const url = await assertSafeUrl("https://example.com/path");
    expect(url.hostname).toBe("example.com");
  });

  it("rejects when DNS lookup fails", async () => {
    lookupMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOTFOUND nonexistent.example"), {
        code: "ENOTFOUND",
      }),
    );
    await expect(
      assertSafeUrl("http://nonexistent.example/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects when DNS returns no records", async () => {
    lookupMock.mockResolvedValueOnce([]);
    await expect(
      assertSafeUrl("http://empty.example/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});

describe("isSafeUrl", () => {
  it("returns false instead of throwing on rejection", async () => {
    await expect(isSafeUrl("http://127.0.0.1/")).resolves.toBe(false);
  });

  it("returns true for safe URLs", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);
    await expect(isSafeUrl("https://example.com/")).resolves.toBe(true);
  });
});
