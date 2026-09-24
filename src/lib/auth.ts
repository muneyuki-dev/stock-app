import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "stock_app_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const SCRYPT_KEY_LENGTH = 64;
const DEFAULT_SCRYPT_N = 16_384;
const DEFAULT_SCRYPT_R = 8;
const DEFAULT_SCRYPT_P = 1;
const SESSION_AUDIENCE = "stock-app";

type AuthConfig = {
  readonly userId: string;
  readonly passwordHash: string;
  readonly sessionSecret: string;
};

type SessionPayload = {
  readonly aud: typeof SESSION_AUDIENCE;
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly nonce: string;
};

export function getAuthConfig(): AuthConfig {
  const userId = process.env.AUTH_USER_ID?.trim();
  const passwordHash = process.env.AUTH_PASSWORD_HASH?.trim();
  const sessionSecret = process.env.AUTH_SESSION_SECRET?.trim();

  if (!userId || !passwordHash || !sessionSecret) {
    throw new Error(
      "AUTH_USER_ID、AUTH_PASSWORD_HASH、AUTH_SESSION_SECRETを設定してください。",
    );
  }
  if (sessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRETは32文字以上で設定してください。");
  }

  return { userId, passwordHash, sessionSecret };
}

function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: n, r, p, maxmem: 128 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new RangeError("パスワードは12文字以上にしてください。");
  }

  const salt = randomBytes(16);
  const derivedKey = await deriveScryptKey(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
    DEFAULT_SCRYPT_N,
    DEFAULT_SCRYPT_R,
    DEFAULT_SCRYPT_P,
  );

  return [
    "scrypt",
    DEFAULT_SCRYPT_N,
    DEFAULT_SCRYPT_R,
    DEFAULT_SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

type ParsedPasswordHash = {
  readonly n: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly expected: Buffer;
};

function parsePasswordHash(encoded: string): ParsedPasswordHash | null {
  const [algorithm, nText, rText, pText, saltText, hashText, extra] =
    encoded.split("$");
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);

  if (
    algorithm !== "scrypt" ||
    extra !== undefined ||
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 2 ||
    n > 1_048_576 ||
    (n & (n - 1)) !== 0 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16 ||
    !saltText ||
    !hashText
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || expected.length !== SCRYPT_KEY_LENGTH) return null;
    return { n, r, p, salt, expected };
  } catch {
    return null;
  }
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (parsed === null || password.length > 1_024) return false;

  try {
    const actual = await deriveScryptKey(
      password,
      parsed.salt,
      parsed.expected.length,
      parsed.n,
      parsed.r,
      parsed.p,
    );
    return timingSafeEqual(actual, parsed.expected);
  } catch {
    return false;
  }
}

export function safeEqualText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSessionToken(
  userId: string,
  secret: string,
  nowMs = Date.now(),
): string {
  const issuedAt = Math.floor(nowMs / 1_000);
  const payload: SessionPayload = {
    aud: SESSION_AUDIENCE,
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  expectedUserId: string,
  nowMs = Date.now(),
): boolean {
  if (!token || token.length > 2_048) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return false;

  const expectedSignature = sign(body, secret);
  if (!safeEqualText(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const now = Math.floor(nowMs / 1_000);
    return (
      payload.aud === SESSION_AUDIENCE &&
      typeof payload.sub === "string" &&
      safeEqualText(payload.sub, expectedUserId) &&
      typeof payload.iat === "number" &&
      payload.iat <= now + 60 &&
      typeof payload.exp === "number" &&
      payload.exp > now &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16
    );
  } catch {
    return false;
  }
}

export function verifyConfiguredSession(token: string | undefined): boolean {
  try {
    const config = getAuthConfig();
    return verifySessionToken(token, config.sessionSecret, config.userId);
  } catch {
    return false;
  }
}

export function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim()
    .toLowerCase();
  return (
    forwardedProto === "https" || new URL(request.url).protocol === "https:"
  );
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();
  const host = request.headers.get("host") ?? forwardedHost;
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function sessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: isHttpsRequest(request),
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export function safeReturnPath(value: unknown): string {
  const containsControlCharacter =
    typeof value === "string" &&
    [...value].some((character) => character.charCodeAt(0) < 32);
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !containsControlCharacter
    ? value
    : "/";
}
