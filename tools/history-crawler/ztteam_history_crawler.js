#!/usr/bin/env node
/**
 * ZTTeam: Công cụ CLI độc lập cào & lọc bài viết lịch sử đa trang
 * Tự động quét hàng trăm/nghìn trang từ biz1.translatetooldenglish.com hoặc các trang WordPress tương tự,
 * lọc chuẩn xác 100% các bài lịch sử theo định dạng tiêu đề, loại trừ ngoại ngữ & drama gia đình,
 * xuất dữ liệu ra file JSON, CSV (Excel) và hỗ trợ đẩy trực tiếp vào WordPress đích.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const {
  ztteam_decodeHtmlEntities,
  ztteam_isHistoryPost,
  ztteam_cleanStoryContent,
} = require('./lib/ztteam_filter');

const {
  ztteam_appendPosts,
} = require('./lib/ztteam_exporter');

const {
  ztteam_publishToWordPress,
} = require('./lib/ztteam_wp_poster');

/** Đường dẫn thư mục gốc của tool */
const ZTTEAM_TOOL_DIR = __dirname;
const ZTTEAM_CONFIG_PATH = path.join(ZTTEAM_TOOL_DIR, 'config.json');

/**
 * Đọc cấu hình mặc định từ file config.json
 */
function ztteam_loadConfig() {
  const defaultConfig = {
    sourceSite: 'https://biz1.translatetooldenglish.com',
    startPage: 1,
    endPage: 10,
    perPage: 100,
    delayMs: 1000,
    outputJson: 'data/history_posts.json',
    outputCsv: 'data/history_posts.csv',
    checkpointFile: 'data/checkpoint.json',
    wordpress: {
      enabled: false,
      wpUrl: '',
      wpUser: '',
      wpPass: '',
      wpCategory: 1,
      wpStatus: 'publish',
    },
  };

  if (fs.existsSync(ZTTEAM_CONFIG_PATH)) {
    try {
      const fileData = fs.readFileSync(ZTTEAM_CONFIG_PATH, 'utf8');
      return { ...defaultConfig, ...JSON.parse(fileData) };
    } catch (e) {
      console.warn(`[Cảnh báo] Không thể đọc file config.json: ${e.message}. Sử dụng cấu hình mặc định.`);
    }
  }

  return defaultConfig;
}

/**
 * Phân tích tham số dòng lệnh CLI
 */
function ztteam_parseCliArgs(args, config) {
  const options = { ...config };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      ztteam_printHelp();
      process.exit(0);
    } else if ((arg === '--start' || arg === '-s') && args[i + 1]) {
      options.startPage = parseInt(args[++i], 10);
    } else if ((arg === '--end' || arg === '-e') && args[i + 1]) {
      options.endPage = parseInt(args[++i], 10);
    } else if (arg === '--all') {
      options.scanAll = true;
    } else if (arg === '--resume' || arg === '-r') {
      options.resume = true;
    } else if (arg === '--site' && args[i + 1]) {
      options.sourceSite = args[++i];
    } else if (arg === '--delay' && args[i + 1]) {
      options.delayMs = parseInt(args[++i], 10);
    } else if (arg === '--output-json' && args[i + 1]) {
      options.outputJson = args[++i];
    } else if (arg === '--output-csv' && args[i + 1]) {
      options.outputCsv = args[++i];
    } else if (arg === '--wp-url' && args[i + 1]) {
      options.wordpress.enabled = true;
      options.wordpress.wpUrl = args[++i];
    } else if (arg === '--wp-user' && args[i + 1]) {
      options.wordpress.enabled = true;
      options.wordpress.wpUser = args[++i];
    } else if (arg === '--wp-pass' && args[i + 1]) {
      options.wordpress.enabled = true;
      options.wordpress.wpPass = args[++i];
    } else if (arg === '--wp-cat' && args[i + 1]) {
      options.wordpress.enabled = true;
      options.wordpress.wpCategory = parseInt(args[++i], 10);
    } else if (arg === '--wp-status' && args[i + 1]) {
      options.wordpress.enabled = true;
      options.wordpress.wpStatus = args[++i];
    }
  }

  return options;
}

/**
 * In màn hình trợ giúp CLI
 */
function ztteam_printHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║               ZTTeam - TOOL CÀO & LỌC BÀI VIẾT LỊCH SỬ ĐA TRANG                ║
╚════════════════════════════════════════════════════════════════════════════════╝

Cách sử dụng:
  node tools/history-crawler/ztteam_history_crawler.js [tuỳ_chọn]

Tuỳ chọn chính:
  --start, -s <số>      Trang bắt đầu quét (mặc định: 1)
  --end, -e <số>        Trang kết thúc quét (mặc định: 10)
  --all                 Tự động quét từ trang bắt đầu đến trang cuối cùng trên site
  --resume, -r          Tiếp tục cào từ trang đã dừng lần trước (theo checkpoint)
  --site <url>          URL website nguồn (mặc định: https://biz1.translatetooldenglish.com)
  --delay <ms>          Thời gian nghỉ giữa các trang (mặc định: 1000ms)
  --output-json <file>  Đường dẫn file JSON đầu ra (mặc định: data/history_posts.json)
  --output-csv <file>   Đường dẫn file CSV đầu ra (mặc định: data/history_posts.csv)

Tuỳ chọn đẩy thẳng vào WordPress đích:
  --wp-url <url>        URL website WordPress đích
  --wp-user <user>      Tài khoản admin WordPress
  --wp-pass <pass>      Application Password WordPress (tạo trong WP Admin > Users > Profile)
  --wp-cat <id>         ID chuyên mục trên WordPress đích (mặc định: 1)
  --wp-status <status>  Trạng thái bài đăng ('publish' hoặc 'draft', mặc định: publish)

Ví dụ thực tế:
  1. Quét 10 trang đầu (1.000 bài):
     node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 10

  2. Quét sâu 50 trang (5.000 bài) và lưu vào file riêng:
     node tools/history-crawler/ztteam_history_crawler.js --start 1 --end 50 --output-json my_posts.json

  3. Tiếp tục quét từ checkpoint cũ:
     node tools/history-crawler/ztteam_history_crawler.js --resume

  4. Quét 5 trang và đăng trực tiếp lên WordPress:
     node tools/history-crawler/ztteam_history_crawler.js -s 1 -e 5 --wp-url https://mysite.com --wp-user admin --wp-pass "abcd 1234 efgh 5678"
`);
}

/**
 * Gửi HTTP request lấy dữ liệu với timeout và tự động retry
 */
function ztteam_fetchJsonWithRetry(targetUrl, maxRetries = 3) {
  return new Promise((resolve) => {
    let attempts = 0;

    function doRequest() {
      attempts++;
      const urlObj = new URL(targetUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const req = client.get(targetUrl, {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 20000,
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(rawData);
              resolve({
                success: true,
                statusCode: res.statusCode,
                data: parsed,
                headers: res.headers,
              });
            } catch (err) {
              resolve({ success: false, statusCode: res.statusCode, error: 'JSON_PARSE_ERROR' });
            }
          } else {
            resolve({
              success: false,
              statusCode: res.statusCode,
              headers: res.headers,
              error: `HTTP_${res.statusCode}`,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxRetries) {
          setTimeout(doRequest, 1500 * attempts);
        } else {
          resolve({ success: false, error: 'TIMEOUT' });
        }
      });

      req.on('error', (err) => {
        if (attempts < maxRetries) {
          setTimeout(doRequest, 1500 * attempts);
        } else {
          resolve({ success: false, error: err.message });
        }
      });
    }

    doRequest();
  });
}

/**
 * Đọc file checkpoint để tiếp tục quét
 */
function ztteam_loadCheckpoint(checkpointPath) {
  if (fs.existsSync(checkpointPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      return data;
    } catch (e) {}
  }
  return null;
}

/**
 * Lưu file checkpoint
 */
function ztteam_saveCheckpoint(checkpointPath, state) {
  try {
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Hàm delay giữa các yêu cầu
 */
function ztteam_sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chương trình điều khiển chính của Tool
 */
async function ztteam_main() {
  const rawConfig = ztteam_loadConfig();
  const options = ztteam_parseCliArgs(process.argv.slice(2), rawConfig);

  /** Chuẩn hóa đường dẫn file đầu ra */
  const jsonPath = path.isAbsolute(options.outputJson)
    ? options.outputJson
    : path.join(ZTTEAM_TOOL_DIR, options.outputJson);

  const csvPath = path.isAbsolute(options.outputCsv)
    ? options.outputCsv
    : path.join(ZTTEAM_TOOL_DIR, options.outputCsv);

  const checkpointPath = path.isAbsolute(options.checkpointFile)
    ? options.checkpointFile
    : path.join(ZTTEAM_TOOL_DIR, options.checkpointFile);

  /** Kiểm tra nếu bật chế độ resume */
  let currentStartPage = options.startPage;
  const existingCheckpoint = ztteam_loadCheckpoint(checkpointPath);

  if (options.resume) {
    if (existingCheckpoint && existingCheckpoint.lastProcessedPage) {
      currentStartPage = existingCheckpoint.lastProcessedPage + 1;
      console.log(`[Khôi phục] Tiếp tục quét từ Trang ${currentStartPage} (theo checkpoint lần trước)`);
    } else {
      console.log(`[Khôi phục] Chưa có checkpoint trước đó. Bắt đầu từ Trang ${currentStartPage}`);
    }
  }

  const siteUrl = options.sourceSite.replace(/\/+$/, '');
  const perPage = options.perPage || 100;

  console.log(`\n================================================================================`);
  console.log(`   🚀 ZTTeam HISTORY CRAWLER - CÀO & LỌC BÀI VIẾT LỊCH SỬ ĐA TRANG`);
  console.log(`================================================================================`);
  console.log(`🌐 Website nguồn:       ${siteUrl}`);
  console.log(`📄 Trang quét:           Trang ${currentStartPage} ➔ ${options.scanAll ? 'HẾT TRANG CUỐI' : 'Trang ' + options.endPage}`);
  console.log(`📦 Số bài/trang:         ${perPage} bài`);
  console.log(`⏱️  Nghỉ giữa các trang:  ${options.delayMs}ms`);
  console.log(`💾 File JSON lưu bài:    ${jsonPath}`);
  console.log(`📊 File CSV (Excel):     ${csvPath}`);
  if (options.wordpress && options.wordpress.enabled && options.wordpress.wpUrl) {
    console.log(`📤 Đẩy WordPress:        BẬT (${options.wordpress.wpUrl} | Category: ${options.wordpress.wpCategory})`);
  } else {
    console.log(`📤 Đẩy WordPress:        TẮT (Chỉ lưu vào file JSON & CSV)`);
  }
  console.log(`================================================================================\n`);

  let totalScanned = existingCheckpoint?.totalScanned || 0;
  let totalMatched = existingCheckpoint?.totalMatched || 0;
  let totalWpPushed = existingCheckpoint?.totalWpPushed || 0;
  let currentPage = currentStartPage;
  let detectedTotalPages = null;

  while (true) {
    if (!options.scanAll && currentPage > options.endPage) {
      break;
    }

    const apiUrl = `${siteUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${currentPage}`;
    process.stdout.write(`[Trang ${currentPage}] Đang tải dữ liệu từ REST API... `);

    const startTime = Date.now();
    const res = await ztteam_fetchJsonWithRetry(apiUrl);
    const durationMs = Date.now() - startTime;

    if (!res.success) {
      if (res.statusCode === 400 || res.error === 'HTTP_400') {
        console.log(`\n✅ Đã hết trang trên website (Trang ${currentPage} trả về 400 - End of Archive). Hoàn tất quét!`);
        break;
      }
      console.log(`❌ Lỗi (${res.error}). Tự động bỏ qua sang trang tiếp theo...`);
      currentPage++;
      continue;
    }

    const posts = res.data;
    if (!Array.isArray(posts) || posts.length === 0) {
      console.log(`\n✅ Trang ${currentPage} không còn bài viết nào. Kết thúc quá trình quét!`);
      break;
    }

    if (res.headers && res.headers['x-wp-totalpages'] && !detectedTotalPages) {
      detectedTotalPages = parseInt(res.headers['x-wp-totalpages'], 10);
      const totalAvailable = res.headers['x-wp-total'] || 'N/A';
      console.log(`(Phát hiện tổng cộng: ${totalAvailable} bài viết trên ${detectedTotalPages} trang)`);
    } else {
      console.log(`(${posts.length} bài tải về trong ${durationMs}ms)`);
    }

    totalScanned += posts.length;

    /** Lọc các bài viết lịch sử */
    const matchedHistoryPosts = [];
    let pageFilteredDramaCount = 0;

    for (const p of posts) {
      const rawTitle = p.title && p.title.rendered ? p.title.rendered : '';
      const isHistory = ztteam_isHistoryPost(rawTitle);

      if (isHistory) {
        const decodedTitle = ztteam_decodeHtmlEntities(rawTitle);
        const { cleanText, cleanHtml, images } = ztteam_cleanStoryContent(p.content && p.content.rendered ? p.content.rendered : '');

        /** Tìm ảnh đại diện tốt nhất (jetpack, featured media hoặc ảnh đầu tiên trong bài) */
        let featuredImage = p.jetpack_featured_media_url || null;
        if (!featuredImage && images && images.length > 0) {
          featuredImage = images[0];
        }

        const historyItem = {
          id: p.id,
          title: decodedTitle,
          url: p.link,
          date: p.date,
          excerpt: p.excerpt && p.excerpt.rendered ? ztteam_decodeHtmlEntities(p.excerpt.rendered.replace(/<[^>]+>/g, '').trim()) : '',
          featured_image: featuredImage,
          images: images,
          content_text: cleanText,
          content_html: cleanHtml,
        };

        matchedHistoryPosts.push(historyItem);
      } else {
        pageFilteredDramaCount++;
      }
    }

    totalMatched += matchedHistoryPosts.length;

    console.log(`   ➜ Tìm thấy: \x1b[32m${matchedHistoryPosts.length} bài Lịch Sử chuẩn\x1b[0m | Đã loại trừ: \x1b[33m${pageFilteredDramaCount} bài kịch bản/ngoại ngữ\x1b[0m`);

    /** Nối dữ liệu ngay vào file JSON & CSV (Streaming mode - bảo vệ an toàn dữ liệu) */
    if (matchedHistoryPosts.length > 0) {
      ztteam_appendPosts(matchedHistoryPosts, jsonPath, csvPath);

      /** In 3 bài mẫu tiêu biểu */
      matchedHistoryPosts.slice(0, 3).forEach((item, idx) => {
        console.log(`      [+] ${item.title.substring(0, 80)}...`);
      });
      if (matchedHistoryPosts.length > 3) {
        console.log(`      ... và ${matchedHistoryPosts.length - 3} bài khác.`);
      }

      /** Nếu bật tự động đẩy sang WordPress */
      if (options.wordpress && options.wordpress.enabled && options.wordpress.wpUrl) {
        process.stdout.write(`   ➜ Đang đẩy ${matchedHistoryPosts.length} bài sang WordPress (${options.wordpress.wpUrl})... `);
        let wpSuccessInPage = 0;
        for (const hp of matchedHistoryPosts) {
          const wpRes = await ztteam_publishToWordPress(hp, options.wordpress);
          if (wpRes.success) {
            wpSuccessInPage++;
            totalWpPushed++;
          }
        }
        console.log(`Đã xuất bản ${wpSuccessInPage}/${matchedHistoryPosts.length} bài thành công!`);
      }
    }

    /** Cập nhật file Checkpoint */
    ztteam_saveCheckpoint(checkpointPath, {
      lastProcessedPage: currentPage,
      totalScanned,
      totalMatched,
      totalWpPushed,
      updatedAt: new Date().toISOString(),
    });

    currentPage++;

    /** Delay lịch sự để tránh làm quá tải máy chủ nguồn */
    if (options.delayMs > 0) {
      await ztteam_sleep(options.delayMs);
    }
  }

  /** Báo cáo tổng kết */
  const matchRate = totalScanned > 0 ? ((totalMatched / totalScanned) * 100).toFixed(1) : 0;
  console.log(`\n================================================================================`);
  console.log(`   🎉 BÁO CÁO TỔNG KẾT QUÁ TRÌNH CÀO LỊCH SỬ`);
  console.log(`================================================================================`);
  console.log(`📊 Tổng số bài đã quét:              ${totalScanned.toLocaleString('vi-VN')} bài`);
  console.log(`✅ Tổng số bài Lịch Sử thu thập:     \x1b[32m${totalMatched.toLocaleString('vi-VN')} bài\x1b[0m (Tỷ lệ khớp: ${matchRate}%)`);
  console.log(`❌ Số bài loại trừ (Ngoại ngữ/Drama): ${(totalScanned - totalMatched).toLocaleString('vi-VN')} bài`);
  if (options.wordpress && options.wordpress.enabled) {
    console.log(`🚀 Số bài đã đăng lên WordPress:      \x1b[36m${totalWpPushed.toLocaleString('vi-VN')} bài\x1b[0m`);
  }
  console.log(`📁 File JSON kết quả:                ${jsonPath}`);
  console.log(`📈 File CSV (Excel) kết quả:          ${csvPath}`);
  console.log(`🔖 File Checkpoint:                   ${checkpointPath}`);
  console.log(`================================================================================\n`);
}

/** Chạy tool */
ztteam_main().catch(err => {
  console.error(`[Lỗi nghiêm trọng] ${err.message}`, err.stack);
  process.exit(1);
});
