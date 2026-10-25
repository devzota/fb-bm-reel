const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SSH_KEY = 'C:/Users/ADMIN/.ssh/auto_reel_zt';
const SSH_HOST = 'root@169.58.122.248';
const CHECKPOINT_FILE = path.join(__dirname, '.batch_rerender_checkpoint.json');

function runSSH(cmd) {
  try {
    const out = execFileSync('ssh', ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', SSH_HOST, cmd], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000 /** 2 phút mỗi lệnh render */
    });
    return out.trim();
  } catch (err) {
    if (err.stdout) return err.stdout.trim();
    throw err;
  }
}

function runSql(container, sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return runSSH(`echo "${b64}" | base64 -d | docker exec -i ${container} psql -U root -d ztreel -t -A -F"|"`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('=== BẮT ĐẦU BATCH RE-RENDER STORY HOOK 2.0 (5 BÀI GẦN NHẤT / PAGE) ===');
  console.log('========================================================================');

  /** 1. Lấy danh sách các Fanpage đang hoạt động & không bị lỗi/chặn token trên Site 3 */
  const pagesRaw = runSql('ztreel3_postgres_prod', `
    SELECT id, name 
    FROM ztteam_pages 
    WHERE is_active = true 
      AND auto_publish_enabled = true 
      AND token_status = 'active'
    ORDER BY name ASC;
  `);

  const pages = pagesRaw.split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => {
      const parts = l.split('|');
      return { id: parts[0], name: parts[1] };
    });

  console.log(`Tìm thấy ${pages.length} Fanpage đang hoạt động & bật xuất bản trên Site 3.`);

  let totalRendered = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const page = pages[pIdx];
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[PAGE ${pIdx + 1}/${pages.length}] Đang xử lý: ${page.name} (${page.id})`);
    console.log(`------------------------------------------------------------------------`);

    /** Lấy 5 bài viết gần nhất trong hàng đợi (chưa đăng, status COMPLETED, xếp theo thời gian tạo cũ nhất) */
    const imagesRaw = runSql('ztreel3_postgres_prod', `
      SELECT id, wp_post_title, video_status, video_engine, video_url
      FROM ztteam_images
      WHERE page_id = '${page.id}' 
        AND is_posted = false 
        AND status = 'COMPLETED'
      ORDER BY created_at ASC
      LIMIT 5;
    `);

    const images = imagesRaw.split('\n')
      .filter(l => l.trim().length > 0)
      .map(l => {
        const parts = l.split('|');
        return {
          id: parts[0],
          title: parts[1],
          videoStatus: parts[2],
          videoEngine: parts[3],
          videoUrl: parts[4] || ''
        };
      });

    if (images.length === 0) {
      console.log(`  -> Fanpage không có bài viết nào đang chờ xuất bản. Bỏ qua.`);
      continue;
    }

    console.log(`  -> Tìm thấy ${images.length} bài viết gần nhất trong hàng đợi.`);

    for (let iIdx = 0; iIdx < images.length; iIdx++) {
      const img = images[iIdx];

      /** Nếu bài viết ĐÃ ĐƯỢC render với PROMPT V2 + FONT TO MỚI (timestamp >= 1792945080000), bỏ qua */
      const isAfterPromptV2 = img.videoUrl && /_(\d{13})\.mp4/.test(img.videoUrl) && Number(img.videoUrl.match(/_(\d{13})\.mp4/)[1]) >= 1792945080000;

      if (img.videoEngine === 'text_story' && img.videoStatus === 'COMPLETED' && isAfterPromptV2) {
        console.log(`  [Bài ${iIdx + 1}/${images.length}] [ĐÃ CÓ PROMPT V2 & FONT TO MỚI] ${img.id}: ${img.title.substring(0, 50)}...`);
        totalSkipped++;
        continue;
      }

      console.log(`  [Bài ${iIdx + 1}/${images.length}] Đang render Story Hook 2.0 (Prompt V2): ${img.id} ("${img.title.substring(0, 45)}...")`);

      try {
        const curlCmd = `curl -s -X POST http://127.0.0.1:3002/api/media/hook-render/${img.id} -H "Content-Type: application/json" -d "{\\"forceRegenHook\\":true,\\"videoEngine\\":\\"text_story\\",\\"forceRegenContent\\":true}"`;
        const resRaw = runSSH(curlCmd);

        let resJson = null;
        try {
          resJson = JSON.parse(resRaw);
        } catch {
          resJson = { raw: resRaw };
        }

        if (resJson && resJson.success) {
          totalRendered++;
          console.log(`    ✅ THÀNH CÔNG: Video URL: ${resJson.videoUrl}`);
        } else {
          const errMsg = resJson.error || resJson.message || resRaw;
          console.error(`    ❌ THẤT BẠI: ${errMsg}`);

          /** KIỂM TRA CIRCUIT BREAKER GEMINI API: 429, 403, 400, quota, blocked, suspended */
          const isGeminiQuotaOrBlocked = 
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('quota') ||
            errMsg.includes('Quota exceeded') ||
            errMsg.includes('rate limit') ||
            errMsg.includes('403') ||
            errMsg.includes('API_KEY_INVALID') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('blocked') ||
            errMsg.includes('suspended') ||
            errMsg.includes('API key not valid');

          if (isGeminiQuotaOrBlocked) {
            console.error('\n========================================================================');
            console.error('🚨 [CIRCUIT BREAKER KÍCH HOẠT] GEMINI API ĐÃ BỊ CHẶN HOẶC HẾT QUOTA!');
            console.error(`Dừng khẩn cấp tiến trình tại Fanpage: ${page.name}`);
            console.error(`Bài viết ID: ${img.id}`);
            console.error(`Chi tiết lỗi: ${errMsg}`);
            console.error('========================================================================\n');

            fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
              stoppedAt: new Date().toISOString(),
              pageIndex: pIdx,
              pageId: page.id,
              pageName: page.name,
              imageId: img.id,
              error: errMsg,
              totalRendered,
              totalSkipped,
            }, null, 2));

            process.exit(2);
          }

          totalFailed++;
        }
      } catch (callErr) {
        console.error(`    ❌ LỖI GỌI API: ${callErr.message}`);
        totalFailed++;
      }

      /** Giãn cách 2 giây an toàn giữa các bài viết */
      await sleep(2000);
    }
  }

  console.log('\n========================================================================');
  console.log('=== HOÀN TẤT TIẾN TRÌNH BATCH RE-RENDER CHO TOÀN BỘ CÁC FANPAGE! ===');
  console.log(`- Đã render mới thành công: ${totalRendered} video`);
  console.log(`- Đã có sẵn (bỏ qua): ${totalSkipped} video`);
  console.log(`- Thất bại: ${totalFailed} video`);
  console.log('========================================================================');
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
