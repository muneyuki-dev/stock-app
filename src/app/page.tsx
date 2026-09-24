import { AllStockScreener } from "@/components/AllStockScreener";
import { FavoriteList } from "@/components/FavoriteList";
import { FavoriteScreener } from "@/components/FavoriteScreener";
import { LogoutButton } from "@/components/LogoutButton";
import { StockCodeForm } from "@/components/StockCodeForm";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6 sm:justify-center sm:px-6 sm:py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          日本株チャート
        </h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-sm text-slate-400">
        お気に入り未登録の日本株も、4桁の銘柄コードで検索できます。詳細画面で日足チャートや移動平均線を確認し、よく見る銘柄をお気に入りに保存できます。
      </p>

      <div className="mt-6 sm:mt-8">
        <StockCodeForm />
      </div>

      <div className="mt-8 sm:mt-10">
        <FavoriteList />
      </div>

      <FavoriteScreener />
      <AllStockScreener />

      <p className="mt-10 text-xs leading-relaxed text-slate-500">
        株価データは Yahoo Finance
        の非公式APIを利用しており、約20分の遅延があります。
        学習・個人利用を目的としたアプリで、投資判断には使用できません。
      </p>
    </main>
  );
}
