export default function StockLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-sm text-slate-400">← 銘柄コード入力へ</p>

      <div className="mt-8 rounded-lg border border-slate-800 p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400"
          />
          <p className="font-medium text-slate-200">
            株価データを取得しています…
          </p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          長期間のチャートを準備しているため、初回は20〜30秒ほどかかることがあります。
        </p>
      </div>
    </main>
  );
}
