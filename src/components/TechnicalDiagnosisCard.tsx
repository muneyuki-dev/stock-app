import {
  TECHNICAL_RULES,
  type TechnicalSnapshot,
  type Timeframe,
  type TrendDirection,
} from "@/lib/technicalAnalysis";

const STATUS = {
  pullback: {
    label: "押し目候補",
    className: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  },
  overheated: {
    label: "過熱気味",
    className: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  uptrend: {
    label: "上昇基調",
    className: "border-sky-800 bg-sky-950/40 text-sky-300",
  },
  watch: {
    label: "様子見",
    className: "border-slate-700 bg-slate-900 text-slate-300",
  },
} as const;

const DIRECTION_LABEL: Readonly<Record<TrendDirection, string>> = {
  rising: "↗ 上向き",
  flat: "→ 横ばい",
  falling: "↘ 下向き",
};

const ALIGNMENT_LABEL = {
  bullish: "強気配列",
  bearish: "弱気配列",
  mixed: "混在",
} as const;

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function yen(value: number): string {
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}円`;
}

export function TechnicalDiagnosisCard({
  snapshot,
  timeframe,
}: {
  readonly snapshot: TechnicalSnapshot | null;
  readonly timeframe: Timeframe;
}) {
  const unit = timeframe === "daily" ? "日" : "週";

  if (snapshot === null) {
    return (
      <section className="mt-6 rounded-xl border border-slate-800 p-4 sm:mt-8 sm:p-5">
        <h2 className="font-semibold">チャート診断（{unit}足）</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          200{unit}
          移動平均線と傾きを計算するには、少なくとも205本のデータが必要です。
          上場からの期間が短い銘柄では診断できないことがあります。
        </p>
      </section>
    );
  }

  const status = STATUS[snapshot.status];
  const volumeLabel =
    snapshot.volumeRatio === null
      ? "判定不可"
      : `${snapshot.volumeRatio.toFixed(2)}倍${
          snapshot.volumeRatio >= TECHNICAL_RULES.volumeSurgeRatio
            ? "（急増）"
            : ""
        }`;

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-800 p-4 sm:mt-8 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">チャート診断（{unit}足）</h2>
          <p className="mt-1 text-xs text-slate-500">
            {snapshot.latestDate}までの価格と出来高による機械判定
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <ul className="mt-4 space-y-1 text-sm leading-relaxed text-slate-300">
        {snapshot.statusReasons.map((reason) => (
          <li key={reason}>・{reason}</li>
        ))}
      </ul>

      <dl className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
        <Metric
          label="移動平均線の並び"
          value={ALIGNMENT_LABEL[snapshot.maAlignment]}
        />
        <Metric
          label={`25・75・200${unit}線の向き`}
          value={(["25", "75", "200"] as const)
            .map(
              (period) =>
                `${period}: ${DIRECTION_LABEL[snapshot.maDirections[period]]}`,
            )
            .join(" / ")}
        />
        <Metric
          label={`75${unit}線からの距離`}
          value={signedPercent(snapshot.distanceFrom75Percent)}
        />
        <Metric label={`出来高（直前20${unit}平均比）`} value={volumeLabel} />
        <Metric
          label="52週高値からの距離"
          value={`${signedPercent(snapshot.distanceFromYearHighPercent)} / 高値 ${yen(snapshot.yearHigh)}`}
        />
        <Metric
          label="52週安値からの距離"
          value={`${signedPercent(snapshot.distanceFromYearLowPercent)} / 安値 ${yen(snapshot.yearLow)}`}
        />
        <Metric
          label="ゴールデンクロス後の初押し"
          value={
            snapshot.firstPullback.matched
              ? `候補（${snapshot.firstPullback.firstTouchDate}）`
              : "該当なし"
          }
        />
        <Metric
          label="25/75ゴールデンクロス"
          value={
            snapshot.firstPullback.goldenCrossDate ?? "直近60本では検出なし"
          }
        />
      </dl>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <PriceLevels title="サポート候補" levels={snapshot.supports} />
        <PriceLevels title="レジスタンス候補" levels={snapshot.resistances} />
      </div>

      {snapshot.dataNotes.length > 0 && (
        <ul className="mt-5 space-y-1 text-xs leading-relaxed text-amber-300/80">
          {snapshot.dataNotes.map((note) => (
            <li key={note}>※ {note}</li>
          ))}
        </ul>
      )}

      <details className="mt-6 text-xs leading-relaxed text-slate-500">
        <summary className="cursor-pointer text-slate-400">
          判定ルールを見る
        </summary>
        <ul className="mt-3 space-y-1.5">
          <li>移動平均線の向き: 5本前との変化が±0.1%以内なら横ばい。</li>
          <li>出来高急増: 当日が直前20本平均の1.5倍以上。</li>
          <li>52週高値接近: 終値が52週高値まで5%以内。</li>
          <li>
            初押し候補:
            25/75ゴールデンクロス後60本以内に75線の8%以上まで上昇し、初めて0〜5%上へ戻った日から3本以内。
          </li>
          <li>
            価格帯候補:
            直近52週の局所的な高値・安値を2%幅でまとめ、2回以上反応した水準。
          </li>
        </ul>
      </details>

      <p className="mt-5 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
        この表示は価格データを一定のルールで整理した学習用の目安です。決算、ニュース、地合いは含まず、売買を勧めるものではありません。
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900/70 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium tabular-nums text-slate-200">
        {value}
      </dd>
    </div>
  );
}

function PriceLevels({
  title,
  levels,
}: {
  readonly title: string;
  readonly levels: TechnicalSnapshot["supports"];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      {levels.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">候補なし</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {levels.map((level) => (
            <li
              key={`${title}-${level.price}-${level.latestDate}`}
              className="flex min-w-0 flex-col items-start gap-1 rounded-lg border border-slate-800 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium tabular-nums">
                {yen(level.price)}
              </span>
              <span className="break-words text-xs text-slate-500 sm:text-right">
                {level.touches}回反応・最終 {level.latestDate}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
