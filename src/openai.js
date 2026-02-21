const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * バッファのメッセージをOpenAI APIで整理・要約する
 * @param {{ label: string, text: string, ts: string }[]} messages
 * @param {object} config - config.yamlの内容
 * @returns {Promise<string>} Markdown形式の要約文字列
 */
async function summarize(messages, config) {
  // タイムスタンプ順にソート
  const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  const messageList = sorted
    .map((m) => `[${m.label}] ${m.text}`)
    .join('\n');

  // ラベルと意味の一覧を作成してシステムプロンプトに含める
  const labelGuide = Object.entries(config.reactions)
    .map(([emoji, label]) => `- ${label}`)
    .join('\n');

  const systemPrompt = `あなたはSlackの会話を整理・要約するアシスタントです。
各メッセージには以下の意味を持つラベルが付いています：
${labelGuide}

以下のルールに従って整理してください：
- ラベルごとにセクションを分けて Markdown 形式でまとめる
- 重複する内容は統合する
- 箇条書きを活用して読みやすくする
- 全体のサマリーを最初に1〜2文で記載する
- 出力は日本語で行う`;

  const userPrompt = `以下のSlackメッセージを整理・要約してください：\n\n${messageList}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content;
}

module.exports = { summarize };
