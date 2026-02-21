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

  return cachedConfig;
}

// 設定を再読み込みしたい場合に使用
function reloadConfig() {
  cachedConfig = null;
  return loadConfig();
}

module.exports = { loadConfig, reloadConfig };
