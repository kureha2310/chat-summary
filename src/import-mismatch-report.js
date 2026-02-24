#!/usr/bin/env node
/**
 * OCRミス作業者レポートをCSVに出力するスクリプト
 *
 * Usage:
 *   node src/import-mismatch-report.js [--out <output.csv>]
 *
 * 出力ファイル: mismatch-enriched-2026-01.csv（デフォルト）
 */
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) parsed.out = args[++i];
  }
  return parsed;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || '').trim();
      });
      return row;
    });
}

function deduplicate(rows, keyFields) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFields.map((f) => row[f] || '').join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** CSVの1フィールドをエスケープ（カンマ・改行・ダブルクォートを含む場合はクォートで囲む） */
function csvField(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildStats(records) {
  const byMistakeType = {};
  const byOcrWorker = {};
  const byConfirmer = {};
  const byCompany = {};
  const byFinalStatus = {};

  for (const r of records) {
    byMistakeType[r.mistakeType] = (byMistakeType[r.mistakeType] || 0) + 1;
    const worker = r.ocrWorker || '不明';
    byOcrWorker[worker] = (byOcrWorker[worker] || 0) + 1;
    byConfirmer[r.confirmer] = (byConfirmer[r.confirmer] || 0) + 1;
    byCompany[r.groupName] = (byCompany[r.groupName] || 0) + 1;
    const status = r.finalStatus || '不明';
    byFinalStatus[status] = (byFinalStatus[status] || 0) + 1;
  }

  return {
    byMistakeType,
    byOcrWorker,
    byConfirmer,
    byCompany,
    byFinalStatus,
    unmatchedCount: records.filter((r) => r.ocrWorker === null).length,
    total: records.length,
  };
}

function printStats(stats) {
  console.log('\n========== 統計サマリー (2026年1月 OCRミス分析) ==========');
  console.log(`総件数: ${stats.total}件  (うちOCR作業者不明: ${stats.unmatchedCount}件)\n`);

  console.log('【ミス種別】');
  Object.entries(stats.byMistakeType).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【OCR作業者別ミス件数】（多い順）');
  Object.entries(stats.byOcrWorker).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【確定者別処理件数】（多い順）');
  Object.entries(stats.byConfirmer).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【最終ステータス】');
  Object.entries(stats.byFinalStatus).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('\n【企業別ミス件数（上位10社）】');
  Object.entries(stats.byCompany).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  console.log('========================================================\n');
}

function main() {
  const { out } = parseArgs();

  const ocrCsvPath = path.join(__dirname, '..', 'mismatch-worker-report-2026-01-ocr-only.csv');
  const mainCsvPath = path.join(__dirname, '..', 'mismatch-worker-report-2026-01.csv');

  console.log('CSVを読み込み中...');
  const ocrRows = parseCSV(ocrCsvPath);
  const mainRows = parseCSV(mainCsvPath);

  console.log(`  OCR-only CSV: ${ocrRows.length}行`);
  console.log(`  Main CSV: ${mainRows.length}行`);

  const dedupedMain = deduplicate(mainRows, ['商品ID', 'Notion種別', '作業日時', '作業者名']);
  const dedupedOcr  = deduplicate(ocrRows,  ['商品ID', 'Notion種別', '作業日時', '作業者名']);
  console.log(`  重複除去後 — Main: ${dedupedMain.length}件, OCR: ${dedupedOcr.length}件`);

  // 商品ID → OCR作業者情報のマップ
  const ocrMap = new Map();
  for (const row of dedupedOcr) {
    const id = row['商品ID'];
    if (id && !ocrMap.has(id)) {
      ocrMap.set(id, { worker: row['作業者名'], workDate: row['作業日時'] });
    }
  }

  const records = dedupedMain.map((row) => {
    const id = row['商品ID'];
    const ocrInfo = ocrMap.get(id);
    return {
      notionDate:   row['Notion日付']      || '',
      mistakeType:  row['Notion種別']      || '',
      companyName:  row['会社名(CSV)']      || '',
      groupName:    row['グループ名(CSV)'] || row['会社(起票)'] || '',
      foodName:     row['食べ物(起票)']    || '',
      foodNameCsv:  row['食べ物(CSV)']     || '',
      confirmer:    row['作業者名']        || '',
      ocrWorker:    ocrInfo?.worker       || null,
      ocrWorkDate:  ocrInfo?.workDate     || '',
      finalStatus:  row['変更後ステータス'] || '',
      productId:    id                    || '',
      candidateCount: row['候補件数']      || '',
    };
  });

  const matched   = records.filter((r) => r.ocrWorker !== null).length;
  const unmatched = records.filter((r) => r.ocrWorker === null).length;
  console.log(`\nマッチング結果:`);
  console.log(`  OCR作業者特定済み: ${matched}件`);
  console.log(`  OCR作業者不明:     ${unmatched}件`);
  if (unmatched > 0) {
    console.log('  未マッチの商品:');
    records.filter((r) => r.ocrWorker === null)
      .forEach((r) => console.log(`    - [${r.mistakeType}] ${r.groupName} / ${r.foodName} (${r.productId})`));
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
        r.notionDate,
        r.companyName,
        r.groupName,
        r.foodName,
        r.foodNameCsv,
        r.mistakeType,
        r.ocrWorker ?? '不明',
        r.ocrWorkDate,
        r.confirmer,
        r.finalStatus,
        r.candidateCount,
        r.productId,
      ].map(csvField).join(',')
    ),
  ];

  const outPath = out || path.join(__dirname, '..', 'mismatch-enriched-2026-01.csv');
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf-8');
  console.log(`CSV出力完了: ${outPath}  (${records.length}件)`);
}

main();
