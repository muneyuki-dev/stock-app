import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAuthConfig,
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  safeEqualText,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/loginRateLimit";

type LoginBody = {
  readonly userId?: unknown;
  readonly password?: unknown;
};

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function invalidCredentialsResponse() {
  return NextResponse.json(
    { error: "ユーザーIDまたはパスワードが違います。" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "不正な送信元からのリクエストです。" },
      { status: 403 },
    );
  }

  let config: ReturnType<typeof getAuthConfig>;
  try {
    config = getAuthConfig();
  } catch {
    return NextResponse.json(
      {
        error:
          "認証設定が不足しています。サーバーの環境変数を確認してください。",
      },
      { status: 503 },
    );
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { error: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!userId || !password || userId.length > 320 || password.length > 1_024) {
    return invalidCredentialsResponse();
  }

  // 接続元単位にすることで、ユーザーIDを変えて試行制限を回避できないようにする。
  const rateLimitKey = clientAddress(request);
  const rateLimit = checkLoginRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "ログイン試行が多すぎます。しばらく待ってから再度お試しください。",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  // ユーザーIDが違う場合も同じハッシュ計算を行い、応答時間の差を抑える。
  const [userMatches, passwordMatches] = await Promise.all([
    Promise.resolve(safeEqualText(userId, config.userId)),
    verifyPassword(password, config.passwordHash),
  ]);

  if (!userMatches || !passwordMatches) {
    recordLoginFailure(rateLimitKey);
    return invalidCredentialsResponse();
  }

  clearLoginFailures(rateLimitKey);
  const token = createSessionToken(config.userId, config.sessionSecret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(request),
  );
  return response;
}
