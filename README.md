# chat-summary

Slack のリアクションを起点に会話を収集し、OpenAI で整理して Notion に自動保存する Bot です。

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/kureha2310/chat-summary)

---

## こんな使い方をします

1. Slack のメッセージに `:bookmark:` などのリアクションを付ける
2. Bot がラベル付きでメモとして蓄積する
3. `:checkered_flag:` を押すと → OpenAI が整理・要約 → Notion に自動保存
4. Slack に「保存しました」と通知が届く

| リアクション         | 意味               |
| -------------------- | ------------------ |
| :bookmark:           | 主題               |
| :thinking_face:      | 検討               |
| :memo:               | 要件               |
| :sos:                | 相談               |
| :speech_balloon:     | コメント           |
| :checkered_flag:     | **まとめ実行**     |

> `config.yaml` を書き換えるだけで絵文字と意味を自由にカスタマイズできます。

---

## セットアップガイド

### はじめに：用意するもの

以下の 4 つのサービスのアカウントが必要です。すべて無料で始められます（OpenAI のみ従量課金）。

| サービス  | 用途                     | 費用          |
| --------- | ------------------------ | ------------- |
| Slack     | Bot を動かすワークスペース | 無料          |
| OpenAI    | AI による要約            | 従量課金（少額）|
| Notion    | まとめの保存先           | 無料          |
| Railway   | Bot のホスティング       | 無料枠あり    |

---

### Step 1：Slack App を作る

#### 1-1. App の作成

1. https://api.slack.com/apps を開いて **Create New App** をクリック
2. **From scratch** を選択
3. App Name（例：`chat-summary`）を入力し、使いたいワークスペースを選択
4. **Create App** をクリック

#### 1-2. 権限（スコープ）の設定

左メニュー **OAuth & Permissions** → **Bot Token Scopes** に以下を追加：

| スコープ           | 説明                               |
| ------------------ | ---------------------------------- |
| `reactions:read`   | リアクションのイベントを受け取る   |
| `channels:history` | メッセージの内容を取得する         |
| `chat:write`       | 完了通知をチャンネルに送る         |

> プライベートチャンネルでも使う場合は `groups:history` も追加してください。

#### 1-3. App をワークスペースにインストール

1. 左メニュー **OAuth & Permissions** を開く
2. **「Install to ○○のワークスペース」** というボタンをクリック（○○はあなたのメールアドレス）
3. 確認画面が出たら **「許可する」** をクリック
4. 元の画面に戻ると **Bot User OAuth Token**（`xoxb-` で始まる文字列）が表示されるのでコピーして保管
   → これが `SLACK_BOT_TOKEN` です

#### 1-4. Signing Secret を取得

1. 左メニュー **Basic Information** → **App Credentials**
2. **Signing Secret** の「Show」をクリックしてコピー
   → これが `SLACK_SIGNING_SECRET` です

#### 1-5. Bot をチャンネルに招待

使いたいチャンネルで以下を入力してください：

```
/invite @chat-summary
```

---

### Step 2：OpenAI API キーを取得する

1. https://platform.openai.com/api-keys を開く
2. **Create new secret key** をクリック
3. 表示されたキー（`sk-` で始まる文字列）をコピーして保管
   → これが `OPENAI_API_KEY` です

> **費用の目安**：gpt-4o-mini を使用。1回のまとめで数円程度（数十メッセージの場合）。

---

### Step 3：Notion を設定する

#### 3-1. インテグレーション（Bot）を作る

1. https://www.notion.so/my-integrations を開く
2. **「新しいインテグレーション」** をクリック
3. 以下のように入力する：
   - **インテグレーション名**：`chat-summary`（任意）
   - **種類**：`内部` のまま変更不要
   - **関連ワークスペース**：自分の Notion ワークスペース名を選択（ドロップダウンに1つだけ出ることが多い）
4. **「作成」** をクリック
5. 「インテグレーションが作成されました」というポップアップが出るので **「インテグレーション設定」** をクリック
6. 設定画面の **「シークレット」** 欄にあるトークン（`secret_` で始まる文字列）をコピー
   → これが `NOTION_TOKEN` です

#### 3-2. 保存先のデータベースを作る

1. Notion でページを新規作成（タイトル例：「Slack まとめ」）
2. 本文に `/table` と入力するとメニューが出るので **「テーブルビュー・データベース」** を選択
   （「テーブル」と2つ出るが、下の「テーブルビュー・データベース」を選ぶこと）
3. 「新規データベース」というポップアップが出るので **「新しい空のデータソース」** をクリック
4. テーブルが作成される。タイトル列の名前が **「名前」** になっていることを確認
   （他の名前になっている場合は `src/notion.js` の `Name:` をその名前に変更してください）

#### 3-3. インテグレーションをデータベースに接続

1. 作成したデータベースページの右上 **「…」** をクリック
2. **「接続」** をクリック → リストから **「chat-summary」**（自分が作ったインテグレーション名）を選択
3. 「このページにchat-summaryを接続する」という確認ポップアップが出るので **「はい」** をクリック

#### 3-4. データベース ID を取得

データベースページを開いたときの URL を確認：

```
https://www.notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...
                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                       ここの 32 文字が DATABASE_ID
```

→ これが `NOTION_DATABASE_ID` です

---

### Step 4：Railway にデプロイする

#### 4-1. デプロイボタンをクリック

README 上部の **Deploy on Railway** ボタンをクリックします。

または、以下の URL を開いてください：
https://railway.app/new/template?template=https://github.com/kureha2310/chat-summary

#### 4-2. GitHub でログイン

Railway のサインアップ画面が出たら **GitHub でログイン** を選択してください。

#### 4-3. 環境変数を入力

デプロイ画面で以下の 5 つを入力します：

| 変数名                  | 入力する値                      |
| ----------------------- | ------------------------------- |
| `SLACK_BOT_TOKEN`       | `xoxb-...`（Step 1-3 で取得） |
| `SLACK_SIGNING_SECRET`  | Signing Secret（Step 1-4 で取得）|
| `OPENAI_API_KEY`        | `sk-...`（Step 2 で取得）      |
| `NOTION_TOKEN`          | `secret_...`（Step 3-1 で取得）|
| `NOTION_DATABASE_ID`    | 32 文字の ID（Step 3-4 で取得）|

#### 4-4. Deploy をクリック

デプロイが完了すると Railway のダッシュボードに URL が表示されます（例：`xxxx.up.railway.app`）。

この URL をコピーして Step 5 で使います。

---

### Step 5：Slack に Events URL を設定する

1. https://api.slack.com/apps に戻り、作成した App を開く
2. 左メニュー **Event Subscriptions** → **Enable Events** をオン
3. **Request URL** に以下を入力：
   ```
   https://あなたのRailwayURL/slack/events
   ```
   例：`https://xxxx.up.railway.app/slack/events`
4. URL を入力すると Slack が確認テストを行い「Verified ✓」と表示されれば OK
5. **Subscribe to bot events** に `reaction_added` を追加
6. **Save Changes** をクリック

これで完了です！

---

### 動作確認

1. Bot を招待したチャンネルでメッセージに `:bookmark:` を付けてみる
2. いくつかメッセージにリアクションをしたあと `:checkered_flag:` を押す
3. Notion に新しいページが作成され、Slack に通知が届けば成功です

---

## config.yaml のカスタマイズ

`config.yaml` を書き換えるだけでリアクションの種類と意味を自由に変更できます。

```yaml
reactions:
  bookmark: 主題          # :bookmark: が押されたら「主題」としてメモ
  thinking_face: 検討
  memo: 要件
  sos: 相談
  speech_balloon: コメント

trigger_reaction: checkered_flag   # これが押されたらまとめ実行

notion_title_prefix: "Slackまとめ"  # Notionページのタイトルの先頭文字
```

絵文字名は Slack の `:emoji_name:` のコロンを除いた部分です（例：`:bookmark:` → `bookmark`）。

変更後は Railway のダッシュボードで **Redeploy** してください。

---

## 今後の予定

- [ ] Discord 対応（リアクションで同様の操作）
- [ ] Notion 以外の保存先対応（Google Docs、Obsidian など）

---

## 注意事項

- バッファはメモリ上に保存されるため、**Bot を再起動するとクリアされます**（Railway の無料プランは一定時間でスリープします）
- OpenAI API の利用には費用がかかります。使いすぎを防ぐために [OpenAI の使用量上限](https://platform.openai.com/settings/organization/limits) を設定しておくことをおすすめします
- Notion データベースのタイトルプロパティが `Name` でない場合は `src/notion.js` の該当箇所を変更してください
