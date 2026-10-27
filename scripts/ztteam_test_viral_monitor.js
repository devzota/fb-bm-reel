/**
 * ZTTeam Test Viral Monitor & Telegram Alert
 * Tác giả: ZTTeam
 * Website: ztteam.site
 */
const { Client } = require('pg');
const axios = require('axios');

async function ztteam_test() {
  console.log('====================================================');
  console.log('🚀 [ZTTeam] KIỂM TRA TÍNH NĂNG VIRAL MONITOR & TELEGRAM');
  console.log('====================================================');

  const client = new Client({
    connectionString: 'postgresql://root:rootpassword@169.58.122.248:5434/ztreel?schema=public'
  });
  await client.connect();

  /** 1. Kiểm tra cấu hình Telegram */
  const teleSettings = await client.query(`
    SELECT key, value FROM ztteam_settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id');
  `);
  let botToken = '';
  let chatId = '';
  for (const row of teleSettings.rows) {
    if (row.key === 'telegram_bot_token') botToken = row.value;
    if (row.key === 'telegram_chat_id') chatId = row.value;
  }
  console.log(`Telegram Bot Token: ${botToken ? '✓ Đã cấu hình' : '❌ Chưa cấu hình'}`);
  console.log(`Telegram Chat ID: ${chatId ? chatId : '❌ Chưa cấu hình'}`);

  /** 2. Kiểm tra bảng ztteam_reel_milestones */
  const tableCheck = await client.query(`
    SELECT count(*) FROM ztteam_reel_milestones;
  `);
  console.log(`Bảng ztteam_reel_milestones: ✓ Tồn tại, hiện có ${tableCheck.rows[0].count} bản ghi.`);

  /** 3. Tìm các bài viết Reel đã đăng trong 7 ngày gần nhất */
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentPosts = await client.query(`
    SELECT i.id, i.wp_post_title, i.wp_post_url, i.fb_post_id, i.posted_at, p.name as page_name, p.fb_page_id, p.page_token_encrypted
    FROM ztteam_images i
    JOIN ztteam_pages p ON i.page_id = p.id
    WHERE i.is_posted = true 
      AND i.fb_post_id IS NOT NULL 
      AND i.posted_at >= '${sevenDaysAgo}'
    LIMIT 10;
  `);

  console.log(`Số bài Reel đăng trong 7 ngày gần nhất (Site 3 sample): ${recentPosts.rows.length} bài.`);
  if (recentPosts.rows.length > 0) {
    const p1 = recentPosts.rows[0];
    console.log(`- Mẫu bài: "${p1.wp_post_title?.slice(0, 40)}" (Page: ${p1.page_name})`);
    console.log(`  FB Post ID: ${p1.fb_post_id}`);
    console.log(`  Website URL (Clean): ${p1.wp_post_url}`);
  }

  /** 4. Gửi thử 1 thông báo Telegram mẫu trực quan */
  if (botToken && chatId) {
    console.log('\nĐang gửi thông báo Telegram mẫu nghiệm thu...');
    const sampleMsg = `🚀 *[TEST TÍNH NĂNG: REEL VIRAL 1,000 VIEWS]*\n\n` +
      `🚩 *Fanpage:* Madeline May\n` +
      `📄 *Bài viết:* I was sitting on my hotel bed in an old college sweatshirt\n` +
      `👁 *Lượt xem:* 1,250 views\n` +
      `🔗 *Link Reel:* https://facebook.com/123456789\n` +
      `🌐 *Link Website (Clean):* https://dacsanthanhphuong.vn/sample-story\n` +
      `💬 *Tự động bình luận:* ✅ Đã tự động comment link bài viết (Không tracking) lên Facebook!\n\n` +
      `_Hệ thống ZT-Reel đã sẵn sàng tự động quét mỗi 15 phút._`;

    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: sampleMsg,
        parse_mode: 'Markdown'
      });
      console.log('✅ Gửi thông báo Telegram mẫu THÀNH CÔNG!');
    } catch (teleErr) {
      console.error('❌ Lỗi gửi Telegram:', teleErr.response?.data || teleErr.message);
    }
  }

  await client.end();
  console.log('\n✓ Hoàn tất kiểm tra!');
}

ztteam_test().catch(console.error);
