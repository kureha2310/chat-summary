const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;

  const filePath = path.resolve(__dirname, '../config.yaml');
  const raw = fs.readFileSync(filePath, 'utf8');
  cachedConfig = yaml.load(raw);
  return cachedConfig;
}

// 設定を再読み込みしたい場合に使用
function reloadConfig() {
  cachedConfig = null;
  return loadConfig();
}

module.exports = { loadConfig, reloadConfig };
