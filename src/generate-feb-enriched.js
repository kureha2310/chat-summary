#!/usr/bin/env node
/**
 * Notion起票データ + 作業詳細CSVを照合して、エンリッチ済みミスマッチCSVを生成するスクリプト
 * （2月以降のデータに使用。1月は import-mismatch-report.js を使用）
 *
 * Usage:
 *   node src/generate-feb-enriched.js --work-csv <作業詳細.csv> [--since 2026-02-01] [--out mismatch-enriched-2026-02.csv]
 *
 * 環境変数:
 *   NOTION_TOKEN
 *   NOTION_REPORT_LOG_DB_ID (デフォルト: 193ae48ad12a436eab2cdd28f28f2842)
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const REPORT_LOG_DB = process.env.NOTION_REPORT_LOG_DB_ID || '193ae48ad12a436eab2cdd28f28f2842';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { since: '2026-02-01' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--work-csv' && args[i + 1]) parsed.workCsv = args[++i];
    else if (args[i] === '--since' && args[i + 1]) parsed.since = args[++i];
    else if (args[i] === '--out' && args[i + 1]) parsed.out = args[++i];
  }
  return parsed;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const values = l.split(',');
      const row = {};
      headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
      return row;
    });
}

function csvField(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** グループ名の表記揺れを吸収するための正規化 */
function normalize(s) {
  return (s || '')
    .replace(/[\s　]/g, '')   // 空白除去
    .replace(/・/g, '・')     // 中黒統一（全角）
    .replace(/＆/g, '&')      // アンパサンド
    .toLowerCase();
}

/** Notion DBから指定日以降の全エントリを取得 */
async function queryNotionAll(since) {
  const entries = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: REPORT_LOG_DB,
      filter: { property: '日付', date: { on_or_after: since } },
      page_size: 100,
      start_cursor: cursor,
    });
    entries.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return entries;
}

/** Notionページからエントリ情報を抽出 */
function parseNotionPage(page) {
  const props = page.properties;

  const titleProp = Object.values(props).find((p) => p.type === 'title');
  const fullTitle = titleProp?.title?.[0]?.text?.content || '';
  const sepIdx = fullTitle.indexOf(' / ');
  const groupName = sepIdx >= 0 ? fullTitle.slice(0, sepIdx).trim() : fullTitle.trim();
  const foodName  = sepIdx >= 0 ? fullTitle.slice(sepIdx + 3).trim() : '';

  const dateProp   = props['日付'];
  const date       = dateProp?.date?.start || '';

  const typeProp   = props['種別'];
  const type       = typeProp?.select?.name || '';

  const reporterProp = props['報告者'];
  const reporter   = reporterProp?.rich_text?.[0]?.text?.content || '';

  return { groupName, foodName, date, type, reporter, pageId: page.id };
}

/** スコアが高いほど一致度が高い（グループ名・食べ物名の一致具合） */
function matchScore(notionGroup, notionFood, workGroup, workFood) {
  const ng = normalize(notionGroup);
  const nf = normalize(notionFood);
  const wg = normalize(workGroup);
  const wf = normalize(workFood);

  let score = 0;
  if (ng === wg) score += 10;
  else if (wg.includes(ng) || ng.includes(wg)) score += 5;

  if (nf === wf) score += 10;
  else if (wf.includes(nf) || nf.includes(wf)) score += 4;
  else if (nf.length > 4 && wf.includes(nf.slice(0, 4))) score += 2;

  return score;
}

/** 作業ログから最もスコアの高い行を1件返す */
function findBestWorkRow(notionEntry, workRows, workType) {
  const scored = workRows
    .filter((r) => r['作業種別'] === workType)
    .map((r) => ({
      row: r,
      score: matchScore(notionEntry.groupName, notionEntry.foodName, r['グループ名'], r['加工品名/生鮮品名']),
    }))
    .filter((x) => x.score >= 8); // 最低スコア（グループ名一致＋食べ物部分一致以上）

  if (scored.length === 0) return null;

  // スコアが同じなら日付が近い方を優先
  if (notionEntry.date) {
    const target = new Date(notionEntry.date);
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.abs(new Date(a.row['作業日時']) - target) - Math.abs(new Date(b.row['作業日時']) - target);
    });
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  return scored[0].row;
}

function buildStats(records) {
  const byType = {}, byOcr = {}, byConfirmer = {}, byGroup = {};
  for (const r of records) {
    byType[r.mistakeType]     = (byType[r.mistakeType] || 0) + 1;
    const w = r.ocrWorker || '不明';
    byOcr[w]                  = (byOcr[w] || 0) + 1;
    byConfirmer[r.confirmer]  = (byConfirmer[r.confirmer] || 0) + 1;
    byGroup[r.groupName]      = (byGroup[r.groupName] || 0) + 1;
  }
  return { byType, byOcr, byConfirmer, byGroup, total: records.length };
}

function printStats(stats) {
  console.log('\n========== 統計サマリー ==========');
  console.log(`総件数: ${stats.total}件`);

  console.log('\n【ミス種別】');
  Object.entries(stats.byType).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【OCR作業者別ミス件数】');
  Object.entries(stats.byOcr).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【確定者別処理件数】');
  Object.entries(stats.byConfirmer).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【グループ別件数（上位10）】');
  Object.entries(stats.byGroup).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('=====================================\n');
}

async function main() {
  const { workCsv, since, out } = parseArgs();

  if (!workCsv) {
    console.error('使い方: node src/generate-feb-enriched.js --work-csv <作業詳細.csv> [--since YYYY-MM-DD] [--out output.csv]');
    process.exit(1);
  }

  console.log(`Notion DB から ${since} 以降のエントリを取得中...`);
  const pages = await queryNotionAll(since);
  const notionEntries = pages.map(parseNotionPage);
  console.log(`  Notion: ${notionEntries.length}件`);

  console.log(`作業詳細CSV を読み込み中: ${workCsv}`);
  const workRows = parseCSV(workCsv);
  const ocrRows  = workRows.filter((r) => r['作業種別'] === 'OCR確認作業');
  const confRows = workRows.filter((r) => r['作業種別'] === '確定作業');
  console.log(`  全作業: ${workRows.length}件 / OCR確認: ${ocrRows.length}件 / 確定作業: ${confRows.length}件`);

  const records = [];
  let matchedOcr = 0, unmatchedOcr = 0, matchedConf = 0;

  for (const entry of notionEntries) {
    // OCR作業者を探す（OCR確認作業 かつグループ名+食べ物名一致）
    const ocrRow  = findBestWorkRow(entry, ocrRows, 'OCR確認作業');
    // 確定者の作業ログを探す（確定作業）
    const confRow = findBestWorkRow(entry, confRows, '確定作業');

    if (ocrRow) matchedOcr++; else unmatchedOcr++;
    if (confRow) matchedConf++;

    records.push({
      notionDate:   entry.date,
      mistakeType:  entry.type,
      companyName:  ocrRow?.['会社名'] || confRow?.['会社名'] || '',
      groupName:    entry.groupName,
      foodName:     entry.foodName,
      foodNameCsv:  ocrRow?.['加工品名/生鮮品名'] || confRow?.['加工品名/生鮮品名'] || '',
      confirmer:    entry.reporter,
      ocrWorker:    ocrRow?.['作業者名'] || null,
      ocrWorkDate:  ocrRow?.['作業日時'] || '',
      finalStatus:  confRow?.['変更後ステータス'] || ocrRow?.['変更後ステータス'] || '',
      productId:    ocrRow?.['商品ID'] || confRow?.['商品ID'] || '',
      candidateCount: '',
    });
  }

  console.log(`\nマッチング結果:`);
  console.log(`  OCR作業者特定済み: ${matchedOcr}件`);
  console.log(`  OCR作業者不明:     ${unmatchedOcr}件`);
  console.log(`  確定作業ログ一致:  ${matchedConf}件`);

  if (unmatchedOcr > 0) {
    console.log('\n  未マッチ（OCR作業者不明）:');
    records.filter((r) => !r.ocrWorker).forEach((r) =>
      console.log(`    - [${r.mistakeType}] ${r.groupName} / ${r.foodName}`)
    );
  }

  printStats(buildStats(records));

  // CSV出力
  const headers = [
    '起票日', '法人名', 'グループ/店舗名', '食べ物名', '食べ物名（CSV詳細）',
    'ミス種別', 'OCR作業者', 'OCR作業日時', '確定者', '最終ステータス',
    '候補件数', '商品ID',
  ];

  const csvLines = [
    headers.join(','),
    ...records.map((r) =>
      [
        r.notionDate, r.companyName, r.groupName, r.foodName, r.foodNameCsv,
        r.mistakeType, r.ocrWorker ?? '不明', r.ocrWorkDate,
        r.confirmer, r.finalStatus, r.candidateCount, r.productId,
      ].map(csvField).join(',')
    ),
  ];

  const outPath = out || path.join(__dirname, '..', `mismatch-enriched-${since.slice(0, 7).replace('-', '-')}.csv`);
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf-8');
  console.log(`CSV出力完了: ${outPath}  (${records.length}件)`);
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
