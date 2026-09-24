# 日本株チャート

Next.js、TypeScript、Yahoo Finance、Lightweight Chartsで作った個人用の日本株分析アプリです。固定ユーザー1名のログイン機能を備えています。

## 初回設定

依存関係をインストールします。

```bash
npm install
```

環境変数ファイルを作成します。

```bash
cp .env.example .env.local
```

ログインに使うパスワードのハッシュを生成します。入力したパスワードは画面に表示されず、保存もされません。

```bash
npm run auth:hash
```

表示された値を`.env.local`の`AUTH_PASSWORD_HASH`へ設定します。あわせて次の3項目を設定してください。

```dotenv
AUTH_USER_ID=自分のユーザーIDまたはメールアドレス
AUTH_PASSWORD_HASH=生成されたscryptハッシュ
AUTH_SESSION_SECRET=32文字以上のランダムな秘密文字列
```

セッション用秘密文字列は、次のコマンドなどで生成できます。

```bash
openssl rand -base64 32
```

## ローカル起動

Macだけで使う場合:

```bash
npm run dev
```

同じWi-Fiのスマートフォンから確認する場合:

```bash
npm run dev -- --hostname 0.0.0.0
```

## Render Freeへ配置する場合

このアプリはAPI Routeとサーバー側のYahoo Finance取得を使うため、Renderでは
`Static Site`ではなく`Web Service`を選択します。

Renderの設定値は次のとおりです。

```text
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm run start
```

`next start`はRenderが設定する`PORT`を自動的に利用し、`0.0.0.0`へバインドします。
`PORT`を手動で環境変数へ追加する必要はありません。

Gitへ`.env.local`を登録せず、RenderのEnvironment Variablesに次を設定します。

- `AUTH_USER_ID`
- `AUTH_PASSWORD_HASH`
- `AUTH_SESSION_SECRET`

Yahoo Finance用のAPIキーや環境変数はありません。HTTPSでアクセスされた場合、
セッションCookieには自動的に`Secure`が付きます。秘密文字列やパスワードハッシュを
変更すると、既存のログイン状態は無効になります。

このアプリはSQLiteを使用せず、永続化が必要なお気に入りはブラウザの
`localStorage`へ保存します。そのためRender Freeの一時ファイルシステムが
再起動時に消えても、アプリのデータは影響を受けません。

簡易ログイン試行制限は1プロセスのメモリ上で管理します。自分専用の単一インスタンス運用を対象としており、サーバー再起動時に履歴はリセットされます。
