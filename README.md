# chat-summary

Slack のリアクションを起点に会話を収集し、OpenAI で整理して Notion に自動保存する Bot です。

---

## こんな使い方をします

1. Slack のメッセージに `:bookmark:` などのリアクションを付ける
2. Bot がラベル付きでメモとして蓄積する
3. `:checkered_flag:` でスレッド単位、または `:dart:` でチャンネル全体をまとめる
4. OpenAI が整理・要約 → Notion に自動保存、Slack に通知が届く

| リアクション           | 意味                                         |
| ---------------------- | -------------------------------------------- |
| :bookmark:             | 主題                                         |
| :thinking_face:        | 検討                                         |
| :memo:                 | 要件                                         |
| :sos:                  | 相談                                         |
| :speech_balloon:       | コメント                                     |
| :spiral_notepad:       | **スレッド全収集**（スレッド内を一括バッファ）|
| :checkered_flag:       | **まとめ実行**（スレッド単位）               |
| :dart:                 | **全体まとめ実行**（チャンネル全バッファ）   |

絵文字の種類や意味は自由に変更できます。→ [カスタマイズ方法はこちら](#カスタマイズ)

---

## 費用について

| サービス | 費用 | 備考 |
| -------- | ---- | ---- |
| Slack    | 無料 | 既存のワークスペースをそのまま使える |
| OpenAI   | 従量課金（少額） | gpt-4o-mini 使用。1回のまとめで数円程度 |
| Notion   | 無料 | |
| Railway  | 最初の $5 は無料 → 以降 月$5 | 詳細は下記 |

### Railway の料金について

Railway は新規登録すると **$5 分のクレジット（Trial プラン）** がもらえます。クレジットカード不要で始められます。

Trial を使い切った後は **Hobby プラン（月 $5）** へのアップグレードが必要です（クレジットカード登録が必要）。Hobby プランには毎月 $5 のクレジットが付いてくるため、このボット程度の軽い用途（常時 RAM 約 60MB、CPU ほぼ 0）であれば **実質 $0〜1/月** で運用できます。

> Railway の最新料金は [railway.app/pricing](https://railway.app/pricing) で確認してください。

---

## セットアップガイド

4 つのサービスのアカウントが必要です。順番に設定していきます。

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

> 使いすぎを防ぐために [OpenAI の使用量上限](https://platform.openai.com/settings/organization/limits) を設定しておくことをおすすめします。

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
   （他の名前になっている場合は `src/notion.js` の `名前:` をその名前に変更してください）

#### 3-3. インテグレーションをデータベースに接続

1. 作成したデータベースページの右上 **「…」** をクリック
2. **「接続」** をクリック → リストから **「chat-summary」**（自分が作ったインテグレーション名）を選択
3. 「このページにchat-summaryを接続する」という確認ポップアップが出るので **「はい」** をクリック

#### 3-4. データベース ID を取得

1. テーブル右上にある **↗**（展開アイコン）をクリックしてデータベースを全画面で開く
2. ブラウザのアドレスバーの URL を確認する
3. `notion.so/` の直後から `?v=` の直前までの **32文字** をコピーする

例：
```
notion.so/30e7d19f477b80fba082ccfd1e44956c?v=xxxxxxxx...
          ←----------32文字----------→
```

→ これが `NOTION_DATABASE_ID` です

---

### Step 4：Railway にデプロイする

#### 4-1. Railway にログイン

1. https://railway.app を開く
2. 右上の **「Login」** をクリック
3. **「Login with GitHub」** を選択してログイン

#### 4-2. 利用規約に同意する

ログイン直後に英語の規約同意画面が出ます。内容は「違法なものをホストしません」という確認です。

- (1/2) Privacy and Data Policy → **下までスクロール**して同意する
- (2/2) Fair Use Policy → **「I will not deploy any of that」**（そういうものはデプロイしません）をクリック

#### 4-3. 新規プロジェクトを作成

1. ログイン後、**「New Project」** をクリック
2. 表示されるメニューから **「GitHub Repository」** を選択
3. 「No repositories found」と表示された場合は **「Configure GitHub App」** をクリック
   → GitHub の権限付与画面が開く
   - リポジトリは **「All repositories」** のままで OK
   - **「Install & Authorize」** をクリック
   → 「Confirm access」画面が出たら、GitHub に登録しているメールに届いた**確認コード**を入力して **「Verify」** をクリック
4. Railway に戻って **「Refresh」** をクリックするとリポジトリが表示されるので **「chat-summary」** を選択

#### 4-4. 環境変数を設定

> **「CRASHED」と表示されても慌てない！**
> 環境変数を設定する前は Bot が起動できないためクラッシュします。これは正常です。
> 次の手順で変数を入力すれば自動で再起動されます。

1. サービス画面の **「Variables」** タブをクリック
2. **「New Variable」** で以下の 5 つを追加：

| 変数名                  | 入力する値                        |
| ----------------------- | --------------------------------- |
| `SLACK_BOT_TOKEN`       | `xoxb-...`（Step 1-3 で取得）   |
| `SLACK_SIGNING_SECRET`  | Signing Secret（Step 1-4 で取得）|
| `OPENAI_API_KEY`        | `sk-...`（Step 2 で取得）        |
| `NOTION_TOKEN`          | `secret_...`（Step 3-1 で取得） |
| `NOTION_DATABASE_ID`    | 32 文字の ID（Step 3-4 で取得）  |

3. 5つ入力し終えたら、画面左上に出る **「Deploy」** ボタンをクリックして反映する

> リアクションの絵文字を変えたい場合は、この画面で追加の変数を設定できます。→ [カスタマイズ方法はこちら](#カスタマイズ)

#### 4-5. デプロイ URL を確認

1. サービス画面の **「Settings」** タブを開く
2. **「Networking」** → **「Public Networking」** の **「Generate Domain」** をクリック
3. ポート番号の入力欄が出るので **`8080` のまま変更せず**、**「Generate Domain」** をクリック
4. `xxxx.up.railway.app` 形式の URL が表示されるのでコピーして Step 5 で使う

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
5. **Subscribe to bot events** を展開 → **「Add Bot User Event」** → `reaction_added` を追加
6. **Save Changes** をクリック

これで完了です！

---

### 動作確認

1. Bot を招待したチャンネルでメッセージに `:bookmark:` などのリアクションを付ける
2. いくつかメッセージにリアクションをしたあと `:checkered_flag:` を押す（スレッド単位）
   または `:dart:` を押す（チャンネル全体）
3. Notion に新しいページが作成され、Slack に通知が届けば成功です

> スレッド内をまとめて収集したい場合は `:spiral_notepad:` を先に押してからトリガーを押してください。

---

## カスタマイズ

リアクションの種類・意味・トリガーを自由に変更できます。方法は2つあります。

### 方法 A：Railway の環境変数で変更する（コード不要）

Railway の **Variables** タブに以下の変数を追加するだけで変更できます。

| 変数名                      | 形式・例                                                       |
| --------------------------- | -------------------------------------------------------------- |
| `REACTIONS`                 | `bookmark:主題,thinking_face:検討,memo:要件,sos:相談,speech_balloon:コメント` |
| `TRIGGER_REACTION`          | `checkered_flag`（スレッド単位のまとめ実行）                  |
| `THREAD_COLLECT_REACTION`   | `spiral_notepad`（スレッド全収集）                            |
| `THREAD_COLLECT_LABEL`      | `スレッド`（収集時に付けるラベル名）                          |
| `GLOBAL_TRIGGER_REACTION`   | `dart`（チャンネル全体のまとめ実行）                          |
| `NOTION_TITLE_PREFIX`       | `週次議事録`                                                   |

追加後は **Deploy** を押して反映してください。

### 方法 B：config.yaml を書き換える（リポジトリを fork した場合）

このリポジトリを fork して自分の GitHub に置いている場合は、`config.yaml` を直接編集できます。

```yaml
reactions:
  bookmark: 主題          # :bookmark: が押されたら「主題」としてメモ
  thinking_face: 検討
  memo: 要件
  sos: 相談
  speech_balloon: コメント

thread_collect_reaction: spiral_notepad  # スレッド内を一括バッファに追加
thread_collect_label: スレッド           # 収集時に付けるラベル名

trigger_reaction: checkered_flag         # スレッド単位でまとめ実行
global_trigger_reaction: dart            # チャンネル全バッファをまとめ実行

notion_title_prefix: "Slackまとめ"       # Notionページのタイトルの先頭文字
```

絵文字名は Slack の `:emoji_name:` のコロンを除いた部分です（例：`:bookmark:` → `bookmark`）。
変更後は Railway のダッシュボードで **Redeploy** してください。

---

## 今後の予定

- [ ] Discord 対応（リアクションで同様の操作）
- [ ] Notion 以外の保存先対応（Google Docs、Obsidian など）

---

## 注意事項

- バッファはメモリ上に保存されるため、**Bot を再起動するとクリアされます**
- Notion データベースのタイトルプロパティが `名前` でない場合は `src/notion.js` の `名前:` をその名前に変更してください
