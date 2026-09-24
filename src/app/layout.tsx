import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日本株チャート",
  description:
    "日本株の日足チャートと移動平均線・ゴールデンクロスを確認する学習用アプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
