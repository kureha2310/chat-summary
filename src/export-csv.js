#!/usr/bin/env node
require('dotenv').config();

const { WebClient } = require('@slack/web-api');
const fs = require('fs');

// ==================
// 引数パース
// ==================
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) parsed.channel = args[++i];
    else if (args[i] === '--since' && args[i + 1]) parsed.since = args[++i];
    else if (args[i] === '--output' && args[i + 1]) parsed.output = args[++i];
  }
  return parsed;
}

const { channel, since, output } = parseArgs();

if (!channel || !since) {
  console.error('使い方: node src/export-csv.js --channel <CHANNEL_ID> --since <YYYY-MM-DD> [--output <file.csv>]');
  console.error('');
  console.error('例: node src/export-csv.js --channel C0123ABCDEF --since 2025-01-01');
  console.error('');
  console.error('チャンネルIDの確認方法:');
  console.error('  Slackでチャンネル名を右クリック → 「リンクをコピー」→ URLの末尾がチャンネルID');
  process.exit(1);
}

const slackToken = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
if (!slackToken) {
  console.error('[ERROR] 環境変数 SLACK_USER_TOKEN または SLACK_BOT_TOKEN が設定されていません。.env を確認してください。');
  process.exit(1);
}

const sinceDate = new Date(since);
if (isNaN(sinceDate.getTime())) {
  console.error(`[ERROR] --since の日付形式が不正です: ${since} (YYYY-MM-DD形式で指定)`);
  process.exit(1);
}

const client = new WebClient(slackToken);

// ==================
// ヘルパー関数
// ==================
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeCsv(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatTs(ts) {
  return new Date(parseFloat(ts) * 1000).toISOString().replace('T', ' ').replace('Z', '');
}

function buildMessageUrl(channelId, ts, threadTs) {
  const pTs = ts.replace('.', '');
  let url = `https://app.slack.com/archives/${channelId}/p${pTs}`;
  if (threadTs && threadTs !== ts) {
    url += `?thread_ts=${threadTs}&cid=${channelId}`;
  }
  return url;
}

// ==================
// ユーザー名一括取得
// ==================
async function fetchAllUsers() {
  const users = new Map();
  let cursor;
  do {
    const res = await client.users.list({ limit: 200, cursor });
    for (const u of res.members) {
      const name = u.profile?.display_name || u.real_name || u.name || u.id;
      users.set(u.id, name);
    }
    cursor = res.response_metadata?.next_cursor || '';
  } while (cursor);
  return users;
}

// ==================
// スレッド返信取得（ページネーション対応）
// ==================
async function fetchThreadReplies(channelId, threadTs) {
  const allReplies = [];
  let cursor;
  do {
    const res = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    allReplies.push(...(res.messages || []));
    cursor = res.response_metadata?.next_cursor || '';
    if (cursor) await sleep(200);
  } while (cursor);
  return allReplies;
}

// ==================
// チャンネル履歴一括取得（スレッド返信含む）
// ==================
async function fetchAllMessages(channelId, sinceTs) {
  const oldest = String(sinceTs);
  const allMessages = [];
  let cursor;
  let threadCount = 0;

  process.stderr.write(`メッセージ取得中...\n`);

  do {
    const res = await client.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      cursor,
    });

    for (const msg of (res.messages || [])) {
      // 親メッセージを追加
      allMessages.push({
        ts: msg.ts,
        threadTs: msg.thread_ts || '',
        user: msg.user || msg.bot_id || '',
        text: msg.text || '',
      });

      // スレッド返信がある場合は取得
      if (msg.reply_count && msg.reply_count > 0) {
        threadCount++;
        const replies = await fetchThreadReplies(channelId, msg.ts);
        // replies[0] は親メッセージなのでスキップ
        for (const reply of replies.slice(1)) {
          allMessages.push({
            ts: reply.ts,
            threadTs: reply.thread_ts || '',
            user: reply.user || reply.bot_id || '',
            text: reply.text || '',
          });
        }
        await sleep(200);
      }
    }

    cursor = res.response_metadata?.next_cursor || '';
    process.stderr.write(`  ${allMessages.length} 件取得済み (スレッド ${threadCount} 個展開)...\n`);
  } while (cursor);

  return allMessages;
}

// ==================
// メイン処理
// ==================
async function main() {
  process.stderr.write(`\n=== Slack チャンネルエクスポート ===\n`);
  process.stderr.write(`チャンネル: ${channel}\n`);
  process.stderr.write(`期間: ${since} 以降\n\n`);

  // ユーザー名取得
  process.stderr.write('ユーザー一覧を取得中...\n');
  const users = await fetchAllUsers();
  process.stderr.write(`  ${users.size} 名のユーザーを取得\n\n`);

  // メッセージ取得
  const sinceTs = sinceDate.getTime() / 1000;
  const messages = await fetchAllMessages(channel, sinceTs);

  if (messages.length === 0) {
    process.stderr.write('\nメッセージが見つかりませんでした。チャンネルIDと日付を確認してください。\n');
    process.stderr.write('Botがチャンネルに参加しているかも確認してください。\n');
    process.exit(0);
  }

  // タイムスタンプ昇順でソート
  messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  // CSV生成
  const header = 'datetime,user_name,message_text,thread_id,message_url';
  const rows = messages.map((m) => {
    const datetime = formatTs(m.ts);
    const userName = escapeCsv(users.get(m.user) || m.user);
    const text = escapeCsv(m.text);
    const threadId = m.threadTs;
    const url = buildMessageUrl(channel, m.ts, m.threadTs);
    return `${datetime},${userName},${text},${threadId},${url}`;
  });

  // UTF-8 BOM + CSV出力
  const BOM = '\uFEFF';
  const csv = BOM + header + '\n' + rows.join('\n') + '\n';

  const outputFile = output || `export-${channel}-${since}.csv`;
  fs.writeFileSync(outputFile, csv, 'utf8');

  process.stderr.write(`\n完了! ${messages.length} 件のメッセージを ${outputFile} に出力しました\n`);
  process.stderr.write(`\n次のステップ:\n`);
  process.stderr.write(`  このCSVをClaudeに渡して「○○に関する議論をまとめて」と聞いてみてください\n`);
}

main().catch((err) => {
  console.error('\n[ERROR] エクスポートに失敗しました:', err.message);
  if (err.data?.error === 'channel_not_found') {
    console.error('→ チャンネルが見つかりません。チャンネルIDを確認し、Botがチャンネルに参加しているか確認してください。');
  } else if (err.data?.error === 'missing_scope') {
    console.error(`→ 権限不足です。Slack Appの設定で必要なスコープを追加してください。`);
    console.error(`  必要なスコープ: channels:history (パブリック) / groups:history (プライベート) / users:read`);
  } else if (err.data?.error === 'not_in_channel') {
    console.error('→ Botがチャンネルに参加していません。Slackでチャンネルに /invite @Bot名 してください。');
  }
  process.exit(1);
});
