import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function encryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
  }
  const buf = Buffer.from(raw, /^[0-9a-fA-F]{64}$/.test(raw) ? "hex" : "utf8");
  if (buf.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes (use: openssl rand -hex 32)",
    );
  }
  return buf;
}

/** Encrypt plaintext for storage (refresh tokens). Format: base64(iv|tag|ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  const buf = Buffer.from(payload, "base64url");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** HMAC-signed OAuth state (company_id + user_id + expiry). */
export function signOAuthState(payload: object): string {
  const key = encryptionKey();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState<T extends Record<string, unknown>>(
  token: string,
): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = encryptionKey();
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as T & { exp?: number };
    if (typeof parsed.exp === "number" && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
