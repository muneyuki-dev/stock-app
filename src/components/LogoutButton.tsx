"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isSubmitting}
      className="min-h-11 shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:cursor-wait disabled:opacity-60"
    >
      {isSubmitting ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
