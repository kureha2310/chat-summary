require('dotenv').config();

const { App, ExpressReceiver } = require('@slack/bolt');
const { loadConfig } = require('./config');
const { addMessage, getMessages, clearMessages, getBufferStatus } = require('./buffer');
const { summarize } = require('./openai');
const { createPage } = require('./notion');

// 必須の環境変数チェック
const required = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'OPENAI_API_KEY',
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID',
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[ERROR] 環境変数 ${key} が設定されていません`);
    process.exit(1);
  }
}

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// まとめ処理中のチャンネルを管理（重複実行防止）
const processingChannels = new Set();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// ==================
// reaction_added イベントハンドラ
// ==================
app.event('reaction_added', async ({ event, client, logger }) => {
  const config = loadConfig();
  const { reaction, item } = event;

  // メッセージへのリアクションのみ対象（ファイルなどは除外）
  if (item.type !== 'message') return;

  const channelId = item.channel;
  const ts = item.ts;

  const label = config.reactions[reaction];
  const isTrigger = reaction === config.trigger_reaction;

  // 設定に含まれないリアクションは無視
  if (!label && !isTrigger) return;

  // ==================
  // トリガーリアクション → まとめ実行
  // ==================
  if (isTrigger) {
    if (processingChannels.has(channelId)) {
      logger.info(`[${channelId}] まとめ処理中のため重複リクエストを無視`);
      return;
    }

    const messages = getMessages(channelId);

    if (messages.length === 0) {
      logger.info(`[${channelId}] トリガーが押されましたが、バッファが空です`);
      return;
    }

    processingChannels.add(channelId);
    logger.info(`[${channelId}] まとめ開始: ${messages.length}件のメッセージ`);

    try {
      // OpenAI で要約
      const summary = await summarize(messages, config);

      // Notionページのタイトルを作成
      const now = new Date();
      const dateStr = now.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const prefix = config.notion_title_prefix || 'Slackまとめ';
      const title = `${prefix} ${dateStr}`;

      // Notion にページ作成
      const pageUrl = await createPage(title, summary, channelId);

      // バッファをクリア
      clearMessages(channelId);

      logger.info(`[${channelId}] Notionにページを作成しました: ${pageUrl}`);

      // Slack に完了通知（オプション: 失敗しても全体は止めない）
      try {
        await client.chat.postMessage({
          channel: channelId,
          text: `まとめをNotionに保存しました :white_check_mark:\n${pageUrl}`,
        });
      } catch (notifyErr) {
        logger.warn('Slack通知の送信に失敗しました（chat:write スコープを確認してください）:', notifyErr.message);
      }
    } catch (err) {
      logger.error('まとめ処理でエラーが発生しました:', err);
    } finally {
      processingChannels.delete(channelId);
    }

    return;
  }

  // ==================
  // 通常のリアクション → バッファにメッセージを追加
  // ==================
  try {
    const result = await client.conversations.history({
      channel: channelId,
      latest: ts,
      inclusive: true,
      limit: 1,
    });

    if (!result.messages || result.messages.length === 0) {
      logger.warn(`[${channelId}] メッセージが見つかりませんでした (ts: ${ts})`);
      return;
    }

    const msg = result.messages[0];

    // スレッド返信にも対応（tsが一致しない場合はスレッドを検索）
    if (msg.ts !== ts && msg.thread_ts) {
      const threadResult = await client.conversations.replies({
        channel: channelId,
        ts: msg.thread_ts,
        latest: ts,
        inclusive: true,
        limit: 1,
      });
      const threadMsg = threadResult.messages?.find((m) => m.ts === ts);
      if (threadMsg) {
        addMessage(channelId, { label, text: threadMsg.text, ts, user: threadMsg.user });
        logger.info(`[${channelId}] バッファに追加(スレッド): [${label}] ${threadMsg.text?.slice(0, 60)}`);
        return;
      }
    }

    addMessage(channelId, { label, text: msg.text, ts, user: msg.user });
    logger.info(`[${channelId}] バッファに追加: [${label}] ${msg.text?.slice(0, 60)}`);
  } catch (err) {
    logger.error(`[${channelId}] メッセージ取得エラー:`, err);
  }
});

// ==================
// デバッグ用エンドポイント（バッファ状態確認）
// ==================
receiver.router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    buffer: getBufferStatus(),
  });
});

// ==================
// ヘルスチェック（Railway用）
// ==================
receiver.router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================
// 起動
// ==================
const port = process.env.PORT || 3000;

(async () => {
  await app.start(port);
  console.log(`Slack→Notion まとめBot 起動中 (port: ${port})`);
  console.log(`Events URL: POST /slack/events`);
})();
