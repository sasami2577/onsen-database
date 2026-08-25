# 温泉データベース 修正版

今回の修正版は、現在の `index.html` の入力項目をできるだけそのまま使い、

- 温泉登録
- 温泉一覧への即時反映
- 検索
- Supabase保存
- Supabase未設定時の端末保存
- Supabase保存失敗時の端末への退避

をまとめています。

## 重要

現在表示されているエラー

「SupabaseのURL・anon keyが未設定です」

は、`index.html` のフォームそのものが壊れているという意味ではありません。

Supabaseへ接続するためのURLとanon keyが、JavaScript側に入っていないことが原因です。

### ファイル構成

```text
index.html
app.js
config.js
styles.css
```

`config.js` は `app.js` より前に読み込んでください。

`index.html` の末尾を次の順番にします。

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="app.js"></script>
```

現在、

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>
```

となっている場合は、真ん中に `config.js` を1行追加します。

## Supabase未設定でも使える理由

URLとanon keyがまだ空欄でも、登録した温泉はブラウザのLocalStorageへ保存されます。

そのため、

「登録したのに温泉一覧に出ない」

という状態を避けられます。

ただし、LocalStorage保存はその端末だけです。

複数端末で同じ温泉データを共有するには、Supabaseの設定が必要です。

## Supabase設定

`config.js` の

```js
window.ONSEN_SUPABASE_CONFIG = {
  url: "",
  anonKey: ""
};
```

に、SupabaseのProject URLとanon keyを入れます。

`service_role` keyは使用しないでください。

## 注意

Supabase側のテーブル名は現在のアプリ仕様に合わせて

```text
onsen_database
```

を使用しています。

また、Supabaseのカラム名がこのJavaScriptの項目名と一致している必要があります。

もしSupabase側のテーブル構造が違う場合は、そこだけ確認してから調整してください。
