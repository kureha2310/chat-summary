const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;

  const filePath = path.resolve(__dirname, '../config.yaml');
  const raw = fs.readFileSync(filePath, 'utf8');
  cachedConfig = yaml.load(raw);

  // 環境変数によるオーバーライド
  // REACTIONS=bookmark:主題,thinking_face:検討,memo:要件
  if (process.env.REACTIONS) {
    const reactions = {};
    process.env.REACTIONS.split(',').forEach((pair) => {
      const sep = pair.indexOf(':');
      if (sep > 0) reactions[pair.slice(0, sep).trim()] = pair.slice(sep + 1).trim();
    });
    cachedConfig.reactions = reactions;
  }
  if (process.env.TRIGGER_REACTION) {
    cachedConfig.trigger_reaction = process.env.TRIGGER_REACTION;
  }
  if (process.env.THREAD_COLLECT_REACTION) {
    cachedConfig.thread_collect_reaction = process.env.THREAD_COLLECT_REACTION;
  }
  if (process.env.THREAD_COLLECT_LABEL) {
    cachedConfig.thread_collect_label = process.env.THREAD_COLLECT_LABEL;
  }
  if (process.env.NOTION_TITLE_PREFIX) {
    cachedConfig.notion_title_prefix = process.env.NOTION_TITLE_PREFIX;
  }
  if (process.env.GLOBAL_TRIGGER_REACTION) {
    cachedConfig.global_trigger_reaction = process.env.GLOBAL_TRIGGER_REACTION;
  }
  // 報告ログDBルーティング（環境変数）
  // 1) REPORT_LOG_DATABASES_JSON
  //    例: {"default":"db1","tools":{"report_detect":"db2"},"channels":{"C123":"db3"}}
  // 2) REPORT_LOG_DB_DEFAULT
  // 3) REPORT_LOG_DB_TOOLS=toolA:db1,toolB:db2
  // 4) REPORT_LOG_DB_CHANNELS=C123:db1,C456:db2
  const reportRoutes = {
    ...(cachedConfig.report_log_databases || {}),
  };

  if (process.env.REPORT_LOG_DATABASES_JSON) {
    try {
      const parsed = JSON.parse(process.env.REPORT_LOG_DATABASES_JSON);
      if (parsed && typeof parsed === 'object') {
        if (parsed.default) reportRoutes.default = parsed.default;
        if (parsed.tools && typeof parsed.tools === 'object') reportRoutes.tools = { ...(reportRoutes.tools || {}), ...parsed.tools };
        if (parsed.channels && typeof parsed.channels === 'object') {
          reportRoutes.channels = { ...(reportRoutes.channels || {}), ...parsed.channels };
        }
      }
    } catch (err) {
      console.error('[WARN] REPORT_LOG_DATABASES_JSON のJSON解析に失敗:', err.message);
    }
  }

  if (process.env.REPORT_LOG_DB_DEFAULT) {
    reportRoutes.default = process.env.REPORT_LOG_DB_DEFAULT;
  }
  if (process.env.REPORT_LOG_DB_TOOLS) {
    const tools = {};
    process.env.REPORT_LOG_DB_TOOLS.split(',').forEach((pair) => {
      const sep = pair.indexOf(':');
      if (sep > 0) tools[pair.slice(0, sep).trim()] = pair.slice(sep + 1).trim();
    });
    reportRoutes.tools = { ...(reportRoutes.tools || {}), ...tools };
  }
  if (process.env.REPORT_LOG_DB_CHANNELS) {
    const channels = {};
    process.env.REPORT_LOG_DB_CHANNELS.split(',').forEach((pair) => {
      const sep = pair.indexOf(':');
      if (sep > 0) channels[pair.slice(0, sep).trim()] = pair.slice(sep + 1).trim();
    });
    reportRoutes.channels = { ...(reportRoutes.channels || {}), ...channels };
  }

  if (Object.keys(reportRoutes).length > 0) {
    cachedConfig.report_log_databases = reportRoutes;
  }

  // REPORT_WATCH_CHANNELS=C0123ABCDEF,C9876FEDCBA
  if (process.env.REPORT_WATCH_CHANNELS) {
    cachedConfig.report_watch_channels = process.env.REPORT_WATCH_CHANNELS
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return cachedConfig;
}

// 設定を再読み込みしたい場合に使用
function reloadConfig() {
  cachedConfig = null;
  return loadConfig();
}

module.exports = { loadConfig, reloadConfig };
