const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1_000;

type Attempt = {
  failures: number;
  windowStartedAt: number;
};

const attempts = new Map<string, Attempt>();

export type RateLimitResult = {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
};

function currentAttempt(key: string, nowMs: number): Attempt | null {
  const attempt = attempts.get(key);
  if (!attempt) return null;
  if (nowMs - attempt.windowStartedAt >= WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return attempt;
}

export function checkLoginRateLimit(
  key: string,
  nowMs = Date.now(),
): RateLimitResult {
  const attempt = currentAttempt(key, nowMs);
  if (!attempt || attempt.failures < MAX_FAILURES) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((WINDOW_MS - (nowMs - attempt.windowStartedAt)) / 1_000),
    ),
  };
}

export function recordLoginFailure(key: string, nowMs = Date.now()): void {
  const attempt = currentAttempt(key, nowMs);
  if (attempt) {
    attempt.failures += 1;
  } else {
    attempts.set(key, { failures: 1, windowStartedAt: nowMs });
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

/** テストでプロセス内の状態を初期化するためだけに使う。 */
export function resetLoginRateLimitsForTesting(): void {
  attempts.clear();
}

export const LOGIN_RATE_LIMIT = {
  maxFailures: MAX_FAILURES,
  windowMinutes: WINDOW_MS / 60_000,
} as const;
