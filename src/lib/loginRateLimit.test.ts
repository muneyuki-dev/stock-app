import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  LOGIN_RATE_LIMIT,
  recordLoginFailure,
  resetLoginRateLimitsForTesting,
} from "./loginRateLimit.ts";

describe("login rate limit", () => {
  beforeEach(() => resetLoginRateLimitsForTesting());

  it("5回失敗すると15分間拒否する", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let index = 0; index < LOGIN_RATE_LIMIT.maxFailures; index++) {
      assert.equal(checkLoginRateLimit("client", now).allowed, true);
      recordLoginFailure("client", now);
    }

    const blocked = checkLoginRateLimit("client", now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 15 * 60);
  });

  it("15分経過またはログイン成功時の消去で再試行できる", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let index = 0; index < LOGIN_RATE_LIMIT.maxFailures; index++) {
      recordLoginFailure("client", now);
    }

    assert.equal(
      checkLoginRateLimit("client", now + 15 * 60_000).allowed,
      true,
    );
    recordLoginFailure("client", now + 15 * 60_000);
    clearLoginFailures("client");
    assert.equal(
      checkLoginRateLimit("client", now + 15 * 60_000).allowed,
      true,
    );
  });

  it("接続元ごとに独立する", () => {
    const now = Date.UTC(2026, 8, 24);
    for (let index = 0; index < LOGIN_RATE_LIMIT.maxFailures; index++) {
      recordLoginFailure("client-a", now);
    }

    assert.equal(checkLoginRateLimit("client-a", now).allowed, false);
    assert.equal(checkLoginRateLimit("client-b", now).allowed, true);
  });
});
