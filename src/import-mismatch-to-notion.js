#!/usr/bin/env node
/**
 * エンリッチ済みミスマッチCSVをNotionに一括インポートするスクリプト
 *
 * Usage:
 *   node src/import-mismatch-to-notion.js --csv <file1.csv> [--csv <file2.csv>...] [--dry-run]
 *
 * 環境変数:
 *   NOTION_TOKEN
 *   NOTION_PARENT_PAGE_ID  インポート先DBを作成する親ページのID
 */
require('dotenv').config();

const fs = require('fs');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { csvFiles: [], dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) parsed.csvFiles.push(args[++i]);
    else if (args[i] === '--dry-run') parsed.dryRun = true;
  }
  return parsed;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    // ダブルクォート対応の簡易パーサー
    const values = [];
    let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"' && !inQ) { inQ = true; }
      else if (l[i] === '"' && inQ && l[i+1] === '"') { cur += '"'; i++; }
      else if (l[i] === '"' && inQ) { inQ = false; }
      else if (l[i] === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += l[i]; }
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function getParentPageId() {
  return process.env.NOTION_PARENT_PAGE_ID || null;
}

async function createDatabase(parentPageId, title) {
  const res = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    properties: {
      名前:               { title: {} },
      法人名:             { rich_text: {} },
      'グループ/店舗名':  { rich_text: {} },
      食べ物名:           { rich_text: {} },
      '食べ物名（CSV詳細）': { rich_text: {} },
      ミス種別: {
        select: {
          options: [
            { name: '【】漏れ',      color: 'yellow' },
            { name: 'アレルゲン漏れ', color: 'red'    },
            { name: 'タグ誤認識',    color: 'orange'  },
            { name: 'ステータス変更', color: 'blue'   },
            { name: '質問・相談',    color: 'purple'  },
            { name: '情報共有',      color: 'gray'    },
          ],
        },
      },
      OCR作業者:  { rich_text: {} },
      OCR作業日:  { date: {} },
      確定者:     { rich_text: {} },
      最終ステータス: {
        select: {
          options: [
            { name: '判定済',         color: 'green'  },
            { name: '未確定',         color: 'gray'   },
            { name: '要確認',         color: 'yellow' },
            { name: '問い合わせ依頼', color: 'orange' },
          ],
        },
      },
      候補件数:   { number: {} },
      商品ID:     { rich_text: {} },
      起票日:     { date: {} },
    },
  });
  return res.id;
}

async function insertRecord(databaseId, row) {
  const props = {
    名前: {
      title: [{ text: { content: `${row['グループ/店舗名']} / ${row['食べ物名']}` } }],
    },
    法人名:             rich(row['法人名']),
    'グループ/店舗名':  rich(row['グループ/店舗名']),
    食べ物名:           rich(row['食べ物名']),
    '食べ物名（CSV詳細）': rich(row['食べ物名（CSV詳細）']),
    OCR作業者:          rich(row['OCR作業者'] || '不明'),
    確定者:             rich(row['確定者']),
    商品ID:             rich(row['商品ID']),
  };

  if (row['ミス種別']) props['ミス種別'] = { select: { name: row['ミス種別'] } };
  if (row['最終ステータス']) props['最終ステータス'] = { select: { name: row['最終ステータス'] } };
  if (row['起票日']) props['起票日'] = { date: { start: row['起票日'] } };
  if (row['OCR作業日時']) {
    try {
      const d = new Date(row['OCR作業日時'].replace(' ', 'T'));
      if (!isNaN(d)) props['OCR作業日'] = { date: { start: d.toISOString() } };
    } catch { /* skip */ }
  }
  if (row['候補件数'] && !isNaN(parseInt(row['候補件数']))) {
    props['候補件数'] = { number: parseInt(row['候補件数']) };
  }

  await notion.pages.create({ parent: { database_id: databaseId }, properties: props });
}

function rich(text) {
  return { rich_text: [{ text: { content: String(text || '') } }] };
}

async function main() {
  const { csvFiles, dryRun } = parseArgs();
  if (csvFiles.length === 0) {
    console.error('使い方: node src/import-mismatch-to-notion.js --csv <file1.csv> [--csv <file2.csv>] [--dry-run]');
    process.exit(1);
  }

  // CSVを全部読み込んで結合
  const allRows = [];
  for (const f of csvFiles) {
    const rows = parseCSV(f);
    console.log(`${f}: ${rows.length}件`);
    allRows.push(...rows);
  }
  console.log(`合計: ${allRows.length}件\n`);

  if (dryRun) {
    console.log('--- DRY RUN: Notionへの書き込みをスキップ ---');
    console.log('先頭3件プレビュー:');
    allRows.slice(0, 3).forEach((r) =>
      console.log(' ', r['起票日'], '|', r['ミス種別'], '|', r['グループ/店舗名'], '/', r['食べ物名'], '| OCR:', r['OCR作業者'])
    );
    return;
  }

  console.log('親ページIDを取得中...');
  const parentPageId = getParentPageId();
  if (!parentPageId) {
    console.error('[ERROR] 親ページIDを取得できませんでした');
    process.exit(1);
  }
  console.log(`  親ページ: ${parentPageId}`);

  const dbTitle = 'OCRミス作業者レポート 2026年1〜2月';
  console.log(`\nNotionデータベース「${dbTitle}」を作成中...`);
  const databaseId = await createDatabase(parentPageId, dbTitle);
  console.log(`  作成完了: ${databaseId}`);

  console.log(`\n${allRows.length}件をインポート中...`);
  let ok = 0, ng = 0;
  for (const row of allRows) {
    try {
      await insertRecord(databaseId, row);
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${allRows.length}件完了...`);
      await sleep(150);
    } catch (err) {
      ng++;
      console.error(`  [ERROR] ${row['グループ/店舗名']} / ${row['食べ物名']}: ${err.message}`);
    }
  }

  console.log(`\n完了! 成功=${ok}件 失敗=${ng}件`);
  console.log(`NotionDB ID: ${databaseId}`);
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
