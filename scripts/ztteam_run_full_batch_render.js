/**
 * ZTTeam Full Batch Render Worker
 * Tác giả: ZTTeam
 * Website: ztteam.site
 * 
 * Mục tiêu: Tự động render toàn bộ 2,330 bài viết chưa đăng trên cả 3 Site
 * Áp dụng 4 mẫu Reel chuẩn nhận diện mới có chữ "ZT" dưới tên Fanpage
 * Bảo vệ tuyệt đối 100% không bao giờ đụng đến 2,393 bài viết đã đăng Facebook.
 */
const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHECKPOINT_FILE = '/var/log/ztteam_render_checkpoint.json';
const LOG_FILE = '/var/log/ztteam_batch_render.log';

/** Cấu hình 3 Site */
const SITES_CONFIG = [
  {
    name: 'Site 3 (reel.ztteam.site - 57 Pages)',
    dbContainer: 'ztreel3_postgres_prod',
    apiPort: 3002,
    priority: 1
  },
  {
    name: 'Site 1 (auto.ztteam.site - 9 Pages)',
    dbContainer: 'ztreel_postgres_prod',
    apiPort: 3000,
    priority: 2
  },
  {
    name: 'Site 2 (reel.didinao.com - 5 Pages)',
    dbContainer: 'ztreel2_postgres_prod',
    apiPort: 3001,
    priority: 3
  }
];

/** Tải danh sách checkpoint để có thể tiếp tục nếu bị gián đoạn */
function ztteam_loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    /** Bỏ qua nếu lỗi đọc file */
  }
  return { completed: {}, stats: { total: 0, success: 0, failed: 0 } };
}

/** Lưu danh sách checkpoint */
function ztteam_saveCheckpoint(checkpoint) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf-8');
  } catch (err) {
    /** Bỏ qua lỗi ghi file */
  }
}

/** Chạy truy vấn SQL trực tiếp qua docker exec psql */
function ztteam_runSql(container, sql) {
  const safeSql = sql.replace(/'/g, "'\\''");
  const cmd = `docker exec ${container} psql -U root -d ztreel -t -A -F "|" -c '${safeSql}'`;
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (err) {
    return '';
  }
}

/** Gửi yêu cầu render đến API qua HTTP nội bộ */
function ztteam_callRenderApi(port, imageId, templateStyle) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      videoEngine: 'text_story',
      templateStyle: templateStyle,
      force: true
    });

    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: `/api/media/hook-render/${imageId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    };

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (e) {
          resolve({ success: false, error: rawData.slice(0, 200) });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'TIMEOUT_120S' });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/** Nghỉ giữa các bài để đảm bảo giải phóng bộ nhớ và giữ nhiệt độ máy chủ mát mẻ */
function ztteam_sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Hàm thực thi chính */
async function ztteam_main() {
  console.log('========================================================================');
  console.log(`[ZTTeam Batch Worker] Khởi động lúc: ${new Date().toISOString()}`);
  console.log('========================================================================');

  const checkpoint = ztteam_loadCheckpoint();
  let overallSuccess = checkpoint.stats.success || 0;
  let overallFailed = checkpoint.stats.failed || 0;

  for (const site of SITES_CONFIG) {
    console.log(`\n>>> ĐANG XỬ LÝ: ${site.name} <<<`);

    /** 
     * Lấy danh sách toàn bộ bài viết CHƯA ĐĂNG thuộc Fanpage khỏe mạnh
     * BẢO VỆ TUYỆT ĐỐI: Loại trừ hoàn toàn bài đã đăng (is_posted = true HOẶC status = 'POSTED')
     */
    const sql = `
      SELECT i.id, i.page_id, trim(p.name) as page_name, COALESCE(p.default_reel_template_id, 'vintage_paper') as template_style
      FROM ztteam_images i
      JOIN ztteam_pages p ON i.page_id = p.id
      WHERE i.is_posted = false 
        AND i.status != 'POSTED'
        AND p.is_active = true 
        AND p.auto_publish_enabled = true
      ORDER BY i.created_at ASC;
    `;

    const rawOutput = ztteam_runSql(site.dbContainer, sql);
    if (!rawOutput) {
      console.log(`Không tìm thấy bài viết chưa đăng nào hoặc truy vấn rỗng trên ${site.name}`);
      continue;
    }

    const rows = rawOutput.split('\n').filter(line => line.includes('|'));
    const posts = rows.map(r => {
      const parts = r.split('|').map(s => s.trim());
      return {
        id: parts[0],
        page_id: parts[1],
        page_name: parts[2],
        template_style: parts[3] || 'vintage_paper'
      };
    }).filter(p => p.id && p.id.length > 5);

    console.log(`Tổng số bài viết chưa đăng cần xử lý trên ${site.name}: ${posts.length} bài`);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      /** Kiểm tra nếu bài này đã hoàn thành trong checkpoint */
      if (checkpoint.completed[post.id]) {
        continue;
      }

      const postIndex = i + 1;
      const startTime = Date.now();
      process.stdout.write(`[${postIndex}/${posts.length}] Post: ${post.id} | Page: "${post.page_name.slice(0, 20)}" | Template: ${post.template_style} ... `);

      const res = await ztteam_callRenderApi(site.apiPort, post.id, post.template_style);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (res && res.success) {
        overallSuccess++;
        checkpoint.completed[post.id] = { status: 'SUCCESS', template: post.template_style, time: new Date().toISOString() };
        console.log(`✅ OK (${elapsed}s) -> ${res.videoUrl || ''}`);
      } else {
        overallFailed++;
        const errMsg = res ? (res.error || res.message || 'Unknown error') : 'No response';
        console.log(`❌ LỖI (${elapsed}s): ${errMsg}`);
      }

      checkpoint.stats = { total: Object.keys(checkpoint.completed).length, success: overallSuccess, failed: overallFailed };
      ztteam_saveCheckpoint(checkpoint);

      /** Nghỉ 1.5 giây giữa mỗi lần render để CPU giải phóng bộ nhớ */
      await ztteam_sleep(1500);
    }

    console.log(`\nHoàn thành lượt quét cho ${site.name}`);
  }

  console.log('\n========================================================================');
  console.log(`[ZTTeam Batch Worker] KẾT THÚC HOÀN TOÀN: Thành công: ${overallSuccess} | Thất bại: ${overallFailed}`);
  console.log('========================================================================');
}

ztteam_main().catch(err => {
  console.error('[ZTTeam Batch Worker FATAL ERROR]:', err);
});
