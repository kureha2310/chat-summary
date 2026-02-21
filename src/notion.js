const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

/**
 * インライン Markdown リンク [text](url) を Notion rich_text 配列に変換する
 * @param {string} text
 * @returns {object[]}
 */
function inlineToRichText(text) {
  const parts = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: { content: text.slice(lastIndex, match.index) } });
    }
    parts.push({ type: 'text', text: { content: match[1], link: { url: match[2] } } });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: { content: text.slice(lastIndex) } });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: { content: text } }];
}

/**
 * Markdown テキストを Notion ブロック配列に変換する
 * @param {string} markdown
 * @returns {object[]}
 */
function markdownToBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];

  for (const line of lines) {
    if (!line.trim()) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [] },
      });
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: inlineToRichText(line.slice(4)) },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: inlineToRichText(line.slice(3)) },
      });
    } else if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: inlineToRichText(line.slice(2)) },
      });
    } else if (line.match(/^[-*] /)) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: inlineToRichText(line.slice(2)) },
      });
    } else if (line.match(/^\d+\. /)) {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: inlineToRichText(line.replace(/^\d+\. /, '')) },
      });
    } else if (line.startsWith('> ')) {
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: { rich_text: inlineToRichText(line.slice(2)) },
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: inlineToRichText(line) },
      });
    }
  }

  // Notion APIはリクエスト1回あたり最大100ブロックまで
  return blocks.slice(0, 100);
}

/**
 * Notionデータベースに新規ページを作成する
 * @param {string} title - ページタイトル
 * @param {string} markdownContent - Markdown形式のコンテンツ
 * @param {string} channelId - SlackチャンネルID（メタ情報として記録）
 * @returns {Promise<string>} 作成されたページのURL
 */
async function createPage(title, markdownContent, channelId) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  const blocks = markdownToBlocks(markdownContent);

  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      名前: {
        title: [{ text: { content: title } }],
      },
    },
    children: blocks,
  });

  return { id: response.id, url: response.url };
}

/**
 * 既存の Notion ページにブロックを追記する
 * @param {string} pageId - 追記先のページ ID
 * @param {string} markdownContent - 追記する Markdown コンテンツ
 */
async function appendToPage(pageId, markdownContent) {
  const blocks = markdownToBlocks(markdownContent);
  await notion.blocks.children.append({
    block_id: pageId,
    children: blocks,
  });
}

module.exports = { createPage, appendToPage };
