require('dotenv').config();
const { parseReport, looksLikeReport } = require('./report-parser');

// 実際のチャンネルから取った報告メッセージのサンプル
const testCases = [
  {
    label: 'nakahama: 長文まとめ報告（複数顧客・複数種別）',
    user: 'nakahama',
    text: `<@U05CE0EG69Y> 生鮮品の「鳥貝」で鶏肉アレルゲンと鳥肉などのタグが付きます。生鮮品の大山どり もも肉に肉類のタグが付いていないようです。
リラッサ様の宴会 4050253 ミックスチーズで【】の追記がありませんでした。
宴会 4400112 バターロールは【】追記がないため大豆アレルギーが抜けておりました。
宴会 4200142 トリュフジュースエキストラの原料の西洋松露はきのこタグがないようです。
コートヤード・バイ・マリオット新大阪ステーション様の大和可楽（クラフトコーラ）で原材料の「キハダの実」でまぐろ等のタグが付きます。
大津SA事務所様のマシュマロで【】の追記がありませんでした。`,
  },
  {
    label: '團: V2.0フィードバック（質問・意見）',
    user: '團',
    text: `<!subteam^S08MVBMEYQ3> cc <@U05CE0EG69Y>
V2.0を一度使用してみての感想、意見等をこのスレッド内にあげていきませんか？
以前よりかなり操作性もよく、回線も重たい感じがなく使いやすいです。
パソコンにより画像の範囲がかわるのであればチェックの見落としがでてくる。
可能なら加工横断検索のときに最新コメントの項目も見れるようになれば`,
  },
  {
    label: 'imamura: 構造化された報告（■〇形式）',
    user: 'imamura',
    text: `<@U05CE0EG69Y>
報告です。

■茶語　新宿高島屋店
〇ナンプラー(新宿)
問い合わせ対象の原材料ですが、要確認コメントに記載されていました。未確定の状態です。

■京王プラザホテル札幌　本部
〇だしパック
会社名が【しゃけを】だからか、さけにチェックが入っていました。さけチェックを外して問い合わせ対象にしました。

■コートヤードバイマリオット白馬
〇油揚げ
親切表示の大豆が抜けていたので【大豆】を追加して確定しました。`,
  },
  {
    label: 'tanaka: 質問（香料のアレルゲン）',
    user: 'tanaka',
    text: `<@U04UV5LB63T> <@U09C952E90X>
香料について質問です。香料のアレルギーって副材由来のものもありますか？
にんにく香料、バニラ香料など基剤名を記載しているものがありましたが、
副材由来の可能性もあると思い問い合わせにしました。`,
  },
  {
    label: 'nakahama: シフト代行依頼（報告ではない）',
    user: 'nakahama',
    text: `<!subteam^S08MVBMEYQ3> 2月15日（日）の18:00から2月16日（月）の18:00までの確定作業ですが、所用のため対応できません。どなたか代行をお願いできないでしょうか。よろしくお願いいたします。`,
  },
  {
    label: 'Ozeki: 隠れアレルゲン共有（情報共有）',
    user: 'Ozeki',
    text: `<@U05CE0EG69Y> CC: <!subteam^S08MVBMEYQ3>
今日の確定作業の中で気になったものを共有させていただきます。
・赤ワインで、かにアレルゲンが含まれているとの問合せ結果が返ってきていました。原材料でそれらしいものはなく、おそらく加工助剤(ろ過)のキトサンと思われます。やっぱり酒類、問合せ必要ですね。
・中浜さんが問合せ依頼に回してくださった怪しいハムの規格書、卵は総合塩漬剤に入っているそうです。`,
  },
];

async function run() {
  console.log('=== report-parser テスト ===\n');

  for (const tc of testCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`【${tc.label}】`);
    console.log(`looksLikeReport: ${looksLikeReport(tc.text)}`);

    if (!looksLikeReport(tc.text)) {
      console.log('→ フィルタで除外（OpenAI呼ばず）');
      continue;
    }

    try {
      const items = await parseReport(tc.text, tc.user);
      console.log(`→ ${items.length}件のアイテムに分解:`);
      items.forEach((item, i) => {
        console.log(`  [${i + 1}] ${item.type}`);
        console.log(`      顧客: ${item.customer}`);
        console.log(`      商品: ${item.product}`);
        console.log(`      詳細: ${item.detail}`);
        if (item.allergen) console.log(`      アレルゲン: ${item.allergen}`);
      });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('\n完了');
}

run();
