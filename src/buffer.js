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
 * 全バッファの状態をデバッグ用に返す
 */
function getBufferStatus() {
  return Object.entries(buffer).map(([ch, msgs]) => ({
    channelId: ch,
    count: msgs.length,
  }));
}

module.exports = { addMessage, getMessages, clearMessages, getBufferStatus };
