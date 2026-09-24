"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

function safeClientReturnPath(value: string): string {
  const containsControlCharacter = [...value].some(
    (character) => character.charCodeAt(0) < 32,
  );
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !containsControlCharacter
    ? value
    : "/";
}

export function LoginForm({ returnTo }: { readonly returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.get("userId"),
          password: form.get("password"),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "ログインできませんでした。");
        return;
      }

      router.replace(safeClientReturnPath(returnTo));
      router.refresh();
    } catch {
      setError("サーバーに接続できませんでした。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="userId" className="text-sm font-medium text-slate-300">
          ユーザーIDまたはメールアドレス
        </label>
        <input
          id="userId"
          name="userId"
          type="text"
          autoComplete="username"
          required
          maxLength={320}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-300"
        >
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1_024}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-sky-600 px-4 py-3 font-medium text-white transition hover:bg-sky-500 disabled:cursor-wait disabled:bg-slate-700"
      >
        {isSubmitting ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
