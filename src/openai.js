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

  const systemPrompt = `あなたはビジネスの議事録・案件メモを作成するアシスタントです。
Slackの会話から重要な情報を抽出し、仕事の記録として使える形式にまとめてください。

各メッセージには以下の意味を持つラベルが付いています：
${labelGuide}

出力ルール：
- 最初の行に「# 」で始まる、内容を的確に表すタイトルを生成する（例：「# 新機能開発における要件整理」）
- 次に「## サマリー」として、何についての議論か・結論や方針を2〜3文で記載する
- 続けてラベルごとにセクションを作り、箇条書きで整理する
- 重複する内容は統合し、具体的でない感情表現や雑談は除外する
- 出力は Markdown 形式、日本語で行う`;

  const userPrompt = `以下のSlackメッセージを議事録形式でまとめてください：\n\n${messageList}`;

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
