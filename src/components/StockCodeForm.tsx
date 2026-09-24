"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { parseStockCode } from "@/lib/stockCode";

/** 入力例として並べるボタン。動作確認しやすいよう主要銘柄を置いている */
const EXAMPLES = [
  { code: "7203", name: "トヨタ自動車" },
  { code: "6758", name: "ソニーグループ" },
  { code: "9432", name: "NTT" },
  { code: "8306", name: "三菱UFJ" },
] as const;

export function StockCodeForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = parseStockCode(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push(`/stocks/${result.value.code}`);
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setError(null);
          }}
          placeholder="7203"
          inputMode="numeric"
          maxLength={6}
          aria-label="銘柄コード"
          aria-invalid={error !== null}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-lg tracking-widest tabular-nums placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-sky-600 px-6 py-3 font-medium transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          表示
        </button>
      </form>

      {/* エラー表示。高さを固定してレイアウトが跳ねないようにしている */}
      <p className="mt-2 min-h-5 text-sm text-rose-400">{error}</p>

      <div className="mt-4">
        <p className="mb-2 text-xs text-slate-500">例</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.code}
              type="button"
              onClick={() => {
                setInput(example.code);
                setError(null);
              }}
              className="min-h-11 rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
            >
              {example.code}
              <span className="ml-1.5 text-slate-500">{example.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
