/**
 * ZTTeam: Script Re-render Video Reel theo đúng 6 yêu cầu bắt buộc:
 * 1. Tuyệt đối không lấy nội dung bài cào gốc (Gemini AI viết 100% kịch bản mới 180 từ).
 * 2. Ưu tiên render lại các video có thời gian đăng gần nhất (i.created_at ASC - FIFO theo lịch xuất bản của Fanpage).
 * 3. Tuyệt đối không render lại các video đã đăng (bảo vệ kép is_posted = true OR status = 'POSTED').
 * 4. Bỏ vĩnh viễn định dạng cũ hook_image (ảnh trên text dưới), áp dụng 3 mẫu mới (vintage_paper, parchment_gold, botanical_sage).
 * 5. Chạy tuần tự theo từng Site và ghi log chi tiết.
 */
const { execFileSync } = require('child_process');

const SSH_KEY = 'C:/Users/ADMIN/.ssh/auto_reel_zt';
const SSH_HOST = 'root@169.58.122.248';

function runSSH(cmd) {
  try {
    return execFileSync('ssh', ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', SSH_HOST, cmd], {
      encoding: 'utf-8',
      timeout: 300000,
    }).trim();
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

const sites = [
  { name: 'Site 1 (auto.ztteam.site)', db: 'ztreel_postgres_prod', api: 'ztreel_api_prod', port: 3000 },
  { name: 'Site 3 (reel.ztteam.site)', db: 'ztreel3_postgres_prod', api: 'ztreel3_api_prod', port: 3002 },
  { name: 'Site 2 (reel.didinao.com)', db: 'ztreel2_postgres_prod', api: 'ztreel2_api_prod', port: 3001 },
];

async function runSiteRerender(site) {
  console.log(`\n===============================================================`);
  console.log(`🎬 BẮT ĐẦU RE-RENDER ƯU TIÊN: ${site.name}`);
  console.log(`===============================================================`);

  /** 1. Đảm bảo tất cả các bài viết cũ có video_engine = 'hook_image' được chuyển sang 'text_story' */
  runSSH(`docker exec ${site.db} psql -U root -d ztreel -c "UPDATE ztteam_images SET video_engine = 'text_story' WHERE (video_engine = 'hook_image' OR video_engine IS NULL) AND is_posted = false AND status != 'POSTED';"`);

  /** 2. Lấy danh sách các bài viết CHƯA ĐĂNG thuộc các Fanpage đang hoạt động tốt, ưu tiên thời gian đăng gần nhất */
  const query = `
    SELECT 
      i.id, 
      i.page_id, 
      trim(p.name) as page_name, 
      COALESCE(p.default_reel_template_id, 'vintage_paper') as template_style,
      to_char(i.created_at, 'YYYY-MM-DD HH24:MI') as post_created,
      trim(i.wp_post_title) as title,
      COALESCE(i.video_url, '') as video_url
    FROM ztteam_images i
    JOIN ztteam_pages p ON i.page_id = p.id
    WHERE (i.is_posted = false OR i.is_posted IS NULL)
      AND i.status != 'POSTED'
      AND p.is_active = true
      AND p.auto_publish_enabled != false
      AND (p.token_status = 'active' OR p.token_status IS NULL)
    ORDER BY 
      i.created_at ASC;
  `;

  const rawOut = runSSH(`docker exec ${site.db} psql -U root -d ztreel -t -A -F"|" -c "${query.replace(/\n/g, ' ')}"`);
  const lines = rawOut.split(/\r?\n/).filter(Boolean);

  console.log(`-> Tổng số bài viết chưa đăng thuộc các Fanpage hoạt động: ${lines.length} bài`);

  let renderedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const parts = lines[idx].split('|');
    if (parts.length < 6) continue;

    const [id, pageId, pageName, templateStyle, postCreated, title, videoUrl] = parts;

    /** 3. Kiểm tra xem bài này có cần render lại không */
    const checkCardCmd = `
      const fs = require('fs');
      const p = '/usr/src/app/apps/api/storage/images/${id}/story_card_data.json';
      if (!fs.existsSync(p)) { 
        console.log('NEED_RENDER_NO_CARD'); 
      } else {
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
          const txt = (d.hookQuote || '') + ' ' + (d.paragraphs || []).join(' ');
          const hookQuote = (d.hookQuote || '').trim();
          const p0 = ((d.paragraphs && d.paragraphs[0]) || '').trim();
          const rawTitle = ${JSON.stringify(title || '')};

          const cleanTitle = rawTitle.replace(/[^\\w\\s]/g, '').toLowerCase().trim();
          const cleanHook = hookQuote.replace(/[^\\w\\s]/g, '').toLowerCase().trim();
          const cleanP0 = p0.replace(/<[^>]*>/g, '').replace(/[^\\w\\s]/g, '').toLowerCase().trim();

          const hookIsTitle = cleanTitle.length > 15 && cleanHook.length > 15 && (cleanHook === cleanTitle || cleanHook.startsWith(cleanTitle.substring(0, 30)));
          const p0IsTitle = cleanTitle.length > 15 && cleanP0.startsWith(cleanTitle.substring(0, 25));
          const p0IsHook = cleanHook.length > 15 && cleanP0.startsWith(cleanHook.substring(0, 25));
          const p0IsUpper = p0.replace(/<[^>]*>/g, '').trim().length > 25 && p0.replace(/<[^>]*>/g, '').trim().substring(0, 30) === p0.replace(/<[^>]*>/g, '').trim().substring(0, 30).toUpperCase();

          const hasHighlight = txt.includes('<span class="hl">');
          const hasCTA = txt.includes('CONTINUED IN THE COMMENTS') || txt.includes('👇');

          const isRawCrawl = !hasHighlight || hasCTA || hookIsTitle || p0IsTitle || p0IsHook || p0IsUpper || (hookQuote && hookQuote === hookQuote.toUpperCase() && hookQuote.length > 20);

          if (isRawCrawl) {
            if (hookIsTitle || p0IsTitle || p0IsHook) console.log('NEED_RENDER_REPEATED_TITLE');
            else if (hasCTA) console.log('NEED_RENDER_CTA');
            else if (p0IsUpper) console.log('NEED_RENDER_UPPERCASE');
            else console.log('NEED_RENDER_NOT_AI');
          } else {
            console.log('AI_CLEAN_VALID');
          }
        } catch(e) { console.log('NEED_RENDER_CORRUPT'); }
      }
    `;
    const checkStatus = runSSH(`docker exec ${site.api} node -e "${checkCardCmd.replace(/\n/g, ' ')}"`);

    /** Nếu đã có kịch bản AI sạch (có highlight <span class="hl">) VÀ video đã render xong định dạng mới text_story */
    if (checkStatus === 'AI_CLEAN_VALID' && videoUrl.includes('text_story')) {
      skippedCount++;
      continue;
    }

    renderedCount++;
    console.log(`\n[${renderedCount}/${lines.length}] Bài: ${id} | Page: "${pageName}" | Mẫu: ${templateStyle}`);
    console.log(`     Tạo lúc: ${postCreated} (Thứ tự ưu tiên sắp đăng)`);
    console.log(`     Tiêu đề: ${title ? title.substring(0, 65) + '...' : ''}`);
    console.log(`     Lý do: card=${checkStatus}, video=${videoUrl ? videoUrl.split('/').pop() : 'CHƯA_RENDER'}`);

    /** Reset trạng thái video_status = PENDING */
    runSSH(`docker exec ${site.db} psql -U root -d ztreel -c "UPDATE ztteam_images SET video_status = 'PENDING', error_log = NULL WHERE id = '${id}';"`);

    /** Xóa card fallback cũ trong container để AI viết lại 100% kịch bản mới */
    runSSH(`docker exec ${site.api} rm -f /usr/src/app/apps/api/storage/images/${id}/story_card_data.json`);

    /** Gọi API render */
    const curlCmd = `curl -s -X POST http://localhost:${site.port}/api/media/hook-render/${id} -H "Content-Type: application/json" -d '{"videoEngine":"text_story","templateStyle":"${templateStyle}","forceRegenContent":true,"force":true}'`;
    try {
      const resStr = runSSH(curlCmd);
      const res = JSON.parse(resStr);
      if (res.success && res.videoUrl) {
        console.log(`     ✓ THÀNH CÔNG: ${res.videoUrl}`);
        successCount++;
      } else {
        console.log(`     ✗ LỖI: ${res.error || res.message}`);
        failCount++;
      }
    } catch (e) {
      console.log(`     ✗ LỖI CỰC BỘ: ${e.message}`);
      failCount++;
    }
  }

  console.log(`\n--- TỔNG KẾT ${site.name} ---`);
  console.log(`- Đã giữ nguyên (kịch bản AI chuẩn sẵn): ${skippedCount} bài`);
  console.log(`- Đã render lại thành công: ${successCount} bài`);
  console.log(`- Lỗi: ${failCount} bài`);
}

async function main() {
  for (const s of sites) {
    await runSiteRerender(s);
  }
  console.log(`\n🎉 HOÀN TẤT QUÁ TRÌNH RE-RENDER TOÀN BỘ CÁC BÀI VIẾT TRÊN CẢ 3 SITE!`);
}

main().catch(console.error);
