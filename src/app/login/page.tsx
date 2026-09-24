import { safeReturnPath } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const returnTo = safeReturnPath(searchParams.returnTo);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4 py-6 sm:px-6 sm:py-16">
      <section className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-medium tracking-widest text-sky-400">
          STOCK APP
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">ログイン</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          株価チャートを開くには、設定済みの認証情報を入力してください。
        </p>
        <LoginForm returnTo={returnTo} />
      </section>
    </main>
  );
}
