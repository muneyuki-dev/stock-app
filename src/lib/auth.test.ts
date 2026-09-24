import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSessionToken,
  hashPassword,
  isHttpsRequest,
  isSameOriginRequest,
  safeReturnPath,
  sessionCookieOptions,
  verifyPassword,
  verifySessionToken,
} from "./auth.ts";

describe("password hashing", () => {
  it("scryptハッシュで正しいパスワードだけを受け入れる", async () => {
    const hash = await hashPassword("correct-password-123");

    assert.match(hash, /^scrypt\$16384\$8\$1\$/);
    assert.equal(await verifyPassword("correct-password-123", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
    assert.equal(await verifyPassword("correct-password-123", "broken"), false);
  });

  it("12文字未満のパスワードはハッシュを生成しない", async () => {
    await assert.rejects(() => hashPassword("short"), RangeError);
  });
});

describe("session token", () => {
  const secret = "a-secure-test-secret-with-at-least-32-characters";
  const now = Date.UTC(2026, 8, 24);

  it("正しい署名とユーザーの有効なトークンを受け入れる", () => {
    const token = createSessionToken("owner@example.com", secret, now);
    assert.equal(
      verifySessionToken(token, secret, "owner@example.com", now + 1_000),
      true,
    );
  });

  it("改ざん、別ユーザー、期限切れを拒否する", () => {
    const token = createSessionToken("owner@example.com", secret, now);
    const tampered = `${token.slice(0, -1)}x`;

    assert.equal(
      verifySessionToken(tampered, secret, "owner@example.com", now),
      false,
    );
    assert.equal(verifySessionToken(token, secret, "other", now), false);
    assert.equal(
      verifySessionToken(
        token,
        secret,
        "owner@example.com",
        now + 8 * 86_400_000,
      ),
      false,
    );
  });
});

describe("request security helpers", () => {
  it("転送プロトコルがHTTPSならSecure Cookieを使う", () => {
    const request = new Request("http://internal:3000/", {
      headers: { "x-forwarded-proto": "https" },
    });
    assert.equal(isHttpsRequest(request), true);
    assert.equal(sessionCookieOptions(request).secure, true);
    assert.equal(sessionCookieOptions(request).httpOnly, true);
    assert.equal(sessionCookieOptions(request).sameSite, "strict");
  });

  it("OriginとHostが同じリクエストだけを受け入れる", () => {
    const valid = new Request("http://localhost:3000/api/auth/login", {
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    const invalid = new Request("http://localhost:3000/api/auth/login", {
      headers: { origin: "https://attacker.example", host: "localhost:3000" },
    });
    assert.equal(isSameOriginRequest(valid), true);
    assert.equal(isSameOriginRequest(invalid), false);
  });

  it("アプリ内の相対パスだけを遷移先として許可する", () => {
    assert.equal(
      safeReturnPath("/stocks/7203?period=1y"),
      "/stocks/7203?period=1y",
    );
    assert.equal(safeReturnPath("https://attacker.example"), "/");
    assert.equal(safeReturnPath("//attacker.example"), "/");
    assert.equal(safeReturnPath("/\\attacker.example"), "/");
  });
});
