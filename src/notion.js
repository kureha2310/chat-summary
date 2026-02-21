const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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
      // 空行は段落区切りとして空ブロックを追加
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
        heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] },
      });
    } else if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else if (line.match(/^[-*] /)) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
        },
      });
    } else if (line.match(/^\d+\. /)) {
      const content = line.replace(/^\d+\. /, '');
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{ type: 'text', text: { content } }],
        },
      });
    } else if (line.startsWith('> ')) {
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
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
