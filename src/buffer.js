// チャンネルIDをキーにしたインメモリバッファ
// { channelId: [{ label, text, ts, user }] }
const buffer = {};

/**
 * バッファにメッセージを追加する
 * @param {string} channelId
 * @param {{ label: string, text: string, ts: string, user: string }} message
 */
function addMessage(channelId, message) {
  if (!buffer[channelId]) {
    buffer[channelId] = [];
  }
  // 同じメッセージ(ts)が重複して追加されないようにチェック
  const alreadyExists = buffer[channelId].some(
    (m) => m.ts === message.ts && m.label === message.label
  );
  if (!alreadyExists) {
    buffer[channelId].push(message);
  }
}

/**
 * チャンネルのバッファを取得する
 * @param {string} channelId
 * @returns {{ label: string, text: string, ts: string, user: string }[]}
 */
function getMessages(channelId) {
  return buffer[channelId] || [];
}

/**
 * チャンネルのバッファをクリアする
 * @param {string} channelId
 */
function clearMessages(channelId) {
  buffer[channelId] = [];
}

/**
 * チャンネル内の全スレッドバッファをまとめて取得する（全体トリガー用）
 * @param {string} channelId
 * @returns {{ label: string, text: string, ts: string, user: string }[]}
 */
function getChannelMessages(channelId) {
  const prefix = `${channelId}:`;
  return Object.entries(buffer)
    .filter(([key]) => key.startsWith(prefix))
    .flatMap(([, msgs]) => msgs);
}

/**
 * チャンネル内の全スレッドバッファをクリアする（全体トリガー用）
 * @param {string} channelId
 */
function clearChannelMessages(channelId) {
  const prefix = `${channelId}:`;
  for (const key of Object.keys(buffer)) {
    if (key.startsWith(prefix)) buffer[key] = [];
  }
}

/**
 * 全バッファの状態をデバッグ用に返す
 */
function getBufferStatus() {
  return Object.entries(buffer).map(([ch, msgs]) => ({
    key: ch,
    count: msgs.length,
  }));
}

module.exports = { addMessage, getMessages, clearMessages, getChannelMessages, clearChannelMessages, getBufferStatus };
