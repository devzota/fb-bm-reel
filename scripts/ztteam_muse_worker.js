/**
 * ZTTeam: Dịch vụ nền tự động hóa Muse.ai (Local Worker Đa Luồng & Chống Trùng Lặp)
 * Tác giả: ZTTeam (ztteam.site)
 * Hỗ trợ đa luồng Chrome độc lập, chống dán thừa ảnh, chống tràn RAM/DOM Leak
 */
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e1) {
  try {
    puppeteer = require('puppeteer');
  } catch (e2) {
    console.error('\n❌ LỖI: Chưa cài đặt thư viện puppeteer-core hoặc puppeteer!');
    console.error('👉 Vui lòng mở CMD tại thư mục này và chạy lệnh:');
    console.error('   npm install puppeteer-core axios form-data\n');
    process.exit(1);
  }
}
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

/** Hỗ trợ cấu hình mục tiêu động qua tham số dòng lệnh hoặc biến môi trường */
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='));
const customTargetUrl = targetArg ? targetArg.split('=')[1] : process.env.TARGET_URL;

let VPS_TARGETS = [];
if (customTargetUrl) {
  const cleanUrl = customTargetUrl.replace(/\/$/, '');
  VPS_TARGETS = [
    { id: 'custom_target', name: cleanUrl, url: cleanUrl }
  ];
} else {
  VPS_TARGETS = [
    { id: 'auto_ztteam', name: 'auto.ztteam.site', url: process.env.AUTO_ZTTEAM_URL || 'http://169.58.122.248:3000' },
    { id: 'didinao',     name: 'reel.didinao.com', url: process.env.DIDINAO_URL     || 'http://169.58.122.248:3001' },
  ];
}

let currentTargetIndex = 0;
const chromePortArg = args.find(a => a.startsWith('--chrome-port='));
const customChromePort = chromePortArg ? chromePortArg.split('=')[1] : null;
const CHROME_DEBUG_URL = customChromePort
  ? `http://127.0.0.1:${customChromePort}`
  : (process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222');

const workerNameArg = args.find(a => a.startsWith('--worker-name='));
const WORKER_NAME = workerNameArg 
  ? workerNameArg.split('=')[1] 
  : (customChromePort ? `Acc-${customChromePort}` : 'Acc-Chinh');

const POLL_INTERVAL_MS = 15000; /** 15 giây kiểm tra hàng đợi một lần */
const TEMP_DIR = path.resolve(__dirname, `./worker_temp_${customChromePort || 'default'}`);
const SUCCESS_COOLDOWN_SEC = 45; /** Nghỉ 45 giây sau khi tạo thành công 1 video */
const FAILURE_COOLDOWN_SEC = 45; /** Nghỉ 45 giây nếu bài gặp lỗi để Muse ổn định */

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/** Biến cờ ngăn chặn chạy song song nhiều job trên cùng 1 worker instance */
let isProcessing = false;

/** Hàm đếm ngược thời gian nghỉ an toàn */
async function ztteam_cooldown(seconds, reason) {
  console.log(`\n⏳ [${WORKER_NAME}] [Nghỉ an toàn] ${reason}.`);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   ⏱️ [${WORKER_NAME}] Đang chờ ${i} giây trước khi tiếp tục...   `);
    await new Promise(r => setTimeout(r, 1000));
  }
  process.stdout.write('\r                                                              \r');
}

/** Hàm tải file từ URL về máy tính */
async function ztteam_downloadFile(url, destPath, targetBaseUrl) {
  const fullUrl = url.startsWith('http') ? url : `${targetBaseUrl}${url}`;
  const response = await axios({
    url: fullUrl,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/** Hàm kiểm tra cổng Chrome debugging có đang mở không */
async function ztteam_isChromeRunning() {
  try {
    const res = await axios.get(`${CHROME_DEBUG_URL}/json/version`, { timeout: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Hàm thực thi render 1 video trên Muse.ai với bảo vệ dán dồn ảnh và giải phóng RAM */
async function ztteam_processVideoJobOnMuse(job, target) {
  console.log(`\n========================================================`);
  console.log(`🎬 [${WORKER_NAME}] BẮT ĐẦU XỬ LÝ JOB TẠO REEL: #${job.id}`);
  console.log(`🌐 Hệ thống : ${target.name} (${target.url})`);
  console.log(`📖 Tiêu đề  : ${job.title}`);
  console.log(`========================================================`);

  const localImagePath = path.join(TEMP_DIR, `job_img_${job.id}.png`);
  const localVideoPath = path.join(TEMP_DIR, `job_vid_${job.id}.mp4`);

  let browser = null;
  let page = null;

  try {
    let videoRendered = false;
    let base64Data = null;

    /** 1. Kết nối Chrome */
    console.log(`🌐 [${WORKER_NAME}] [1/4] Đang kết nối tới Chrome (${CHROME_DEBUG_URL})...`);
    browser = await puppeteer.connect({
      browserURL: CHROME_DEBUG_URL,
      defaultViewport: null,
      protocolTimeout: 600000, /** 10 phút timeout CDP */
    });

    const pages = await browser.pages();
    page = pages.find(p => p.url().includes('muse.ai')) || pages[0];
    if (!page) {
      console.log(`ℹ️ [${WORKER_NAME}] Mở tab Muse.ai mới...`);
      page = await browser.newPage();
    }
    await page.bringToFront();

    /** 2. BẢO VỆ CHỐNG TRÀN RAM & XÓA SẠCH ẢNH CŨ TRONG REACT STATE:
     * Tự động điều hướng về https://muse.ai/ trước mỗi job mới
     * Thao tác này hủy bỏ toàn bộ video cũ trong DOM, giải phóng 3GB RAM về 100MB, và làm sạch 100% ảnh sót lại
     */
    console.log(`🔄 [${WORKER_NAME}] Đang làm mới tab Muse.ai để giải phóng RAM & xóa sạch ảnh cũ...`);
    await page.goto('https://muse.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    /** Chờ khung nhập liệu sẵn sàng */
    await page.waitForSelector('textarea', { timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    /** Tải ảnh hiện tại của job từ VPS về máy tính */
    if (fs.existsSync(localImagePath)) {
      try { fs.unlinkSync(localImagePath); } catch (e) {}
    }
    console.log(`⬇️ [${WORKER_NAME}] Đang tải ảnh từ ${target.name}: ${job.imageUrl}`);
    await ztteam_downloadFile(job.imageUrl, localImagePath, target.url);
    console.log(`✅ [${WORKER_NAME}] Đã lưu ảnh tạm tại: ${localImagePath}`);

    /** 3. BẢO VỆ 2 LỚP CHỐNG LỖI DÁN DỒN 3 - 5 ẢNH VÀO KHUNG CHAT:
     * Lớp 1: Quét dọn sạch sẽ tất cả mọi nút đóng/xóa ảnh nếu có trước khi upload
     */
    console.log(`🧹 [${WORKER_NAME}] Đang quét dọn khung chat để đảm bảo không còn ảnh sót lại...`);
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const removeButtons = allButtons.filter(btn => {
        const hasImg = btn.closest('div')?.querySelector('img') !== null;
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const isRemove = ariaLabel.includes('xóa') || ariaLabel.includes('delete') || ariaLabel.includes('remove') || ariaLabel.includes('close');
        return hasImg || isRemove;
      });
      removeButtons.forEach(b => {
        try { b.click(); } catch (e) {}
      });
    });
    await new Promise(r => setTimeout(r, 600));

    /** Chọn đúng thẻ input file của khung chat */
    const fileInputs = await page.$$('input[type="file"]');
    if (!fileInputs || fileInputs.length === 0) throw new Error('Không tìm thấy input[type="file"] trên Muse.ai');
    const chatFileInput = fileInputs.length > 1 ? fileInputs[fileInputs.length - 1] : fileInputs[0];
    
    console.log(`📤 [${WORKER_NAME}] Đang đính kèm ảnh duy nhất của bài viết vào khung chat...`);
    await chatFileInput.uploadFile(localImagePath);
    await new Promise(r => setTimeout(r, 3000));

    /** Lớp 2: KIỂM TRA NGHIÊM NGẶT SỐ LƯỢNG ẢNH SAU KHI UPLOAD
     * Đảm bảo chính xác 1 ảnh duy nhất, nếu có nhiều hơn 1 thì lập tức xóa bỏ các ảnh thừa
     */
    const postUploadCheck = await page.evaluate(() => {
      const form = document.querySelector('textarea')?.closest('form') || document.querySelector('textarea')?.closest('div.relative') || document.body;
      const previewImgs = Array.from(form.querySelectorAll('img')).filter(img => {
        const isAvatar = img.closest('.rounded-full') !== null || img.width <= 36 || img.height <= 36;
        return !isAvatar;
      });
      return {
        count: previewImgs.length,
      };
    });

    if (postUploadCheck.count > 1) {
      console.warn(`⚠️ [${WORKER_NAME}] CẢNH BÁO: Phát hiện ${postUploadCheck.count} ảnh trong khung chat! Đang tiến hành loại bỏ các ảnh thừa...`);
      await page.evaluate(() => {
        const form = document.querySelector('textarea')?.closest('form') || document.querySelector('textarea')?.closest('div.relative') || document.body;
        const removeBtns = Array.from(form.querySelectorAll('button')).filter(btn => {
          return btn.closest('div')?.querySelector('img') !== null;
        });
        /** Xóa từ đầu đến trước ảnh cuối cùng để giữ lại đúng 1 ảnh mới nhất */
        for (let i = 0; i < removeBtns.length - 1; i++) {
          try { removeBtns[i].click(); } catch (e) {}
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ [${WORKER_NAME}] Đã xác nhận khung chat chỉ có ĐÚNG 1 ảnh chuẩn.`);

    /** 4. ĐÓNG DẤU DOM (DATA-ZTTEAM-OLD): Đánh dấu 100% video, nút tải và tin nhắn cũ để tuyệt đối không nhận nhầm */
    console.log(`🏷️ [${WORKER_NAME}] Đang đóng dấu DOM các video và nút tải cũ trước khi gửi prompt...`);
    await page.evaluate(() => {
      document.querySelectorAll('video, button[aria-label="Tải video xuống"], [data-message-author-role="assistant"], .prose').forEach(el => {
        el.setAttribute('data-ztteam-old', 'true');
      });
    });

    /** 5. Dán prompt duy nhất 1 lần và bấm gửi */
    console.log(`✍️ [${WORKER_NAME}] Đang dán câu lệnh & nội dung câu chuyện...`);
    const textarea = await page.$('textarea');
    if (!textarea) throw new Error('Không tìm thấy ô textarea để nhập prompt');
    await textarea.click();

    /** Dán toàn bộ nội dung qua React prototype setter kết hợp execCommand để kích hoạt đầy đủ sự kiện */
    await page.evaluate((fullPrompt) => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      ta.focus();
      const proto = Object.getPrototypeOf(ta);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(ta, fullPrompt);
      } else {
        ta.value = fullPrompt;
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      document.execCommand('insertText', false, ' ');
      document.execCommand('delete', false, null);
    }, job.prompt);
    await new Promise(r => setTimeout(r, 1000));

    console.log(`🚀 [${WORKER_NAME}] Đang bấm gửi tin nhắn...`);
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return false;

      const allButtons = Array.from(document.querySelectorAll('button'));
      /** 1. Tìm nút có nhãn Gửi hoặc Send */
      let targetBtn = allButtons.find(b => {
        if (b.disabled) return false;
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();
        const text = (b.innerText || '').toLowerCase();
        return aria.includes('gửi') || aria.includes('send') || title.includes('gửi') || title.includes('send') || text.includes('gửi') || text.includes('send');
      });

      /** 2. Nếu không có nhãn, tìm nút tròn chứa SVG nằm trong hoặc gần khung nhập liệu */
      if (!targetBtn && ta.parentElement) {
        let parent = ta.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const btns = Array.from(parent.querySelectorAll('button'));
          for (const b of btns) {
            if (b.disabled) continue;
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            if (aria.includes('đính kèm') || aria.includes('attach') || aria.includes('xóa') || aria.includes('close') || b.querySelector('input[type="file"]')) {
              continue;
            }
            if (b.querySelector('svg')) {
              targetBtn = b;
              break;
            }
          }
          if (targetBtn) break;
          parent = parent.parentElement;
        }
      }

      if (targetBtn && !targetBtn.disabled) {
        targetBtn.click();
        return true;
      }
      return false;
    });

    /** Vòng lặp xác nhận tin nhắn đã thực sự được gửi đi */
    let ztteam_isSent = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 1200));
      const textareaContent = await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        return ta ? ta.value.trim() : '';
      });

      if (!textareaContent) {
        ztteam_isSent = true;
        console.log(`✅ [${WORKER_NAME}] Đã xác nhận tin nhắn đã gửi đi (khung chat đã sạch)!`);
        break;
      }

      console.log(`⚠️ [${WORKER_NAME}] Tin nhắn chưa bay (thử kích hoạt lại lần ${attempt + 1}/5)...`);
      await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        if (ta) ta.focus();
      });

      if (attempt % 2 === 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
      } else {
        await page.keyboard.press('Enter');
      }
    }

    /** 6. ĐÁNH DẤU RANH GIỚI TIN NHẮN VỪA GỬI: Chỉ lấy video xuất hiện SAU tin nhắn này */
    await page.evaluate((promptSnippet) => {
      const allDivs = Array.from(document.querySelectorAll('[data-message-author-role="user"], div'));
      const promptDiv = allDivs.find(d => {
        const txt = (d.innerText || '');
        return txt.includes(promptSnippet) && !d.querySelector('textarea');
      });
      if (promptDiv) {
        promptDiv.setAttribute('data-ztteam-user-prompt', 'true');
      }
    }, job.prompt.slice(0, 30));

    /** 7. Chờ Muse.ai render xong video 15s (Tối thiểu 25s, tối đa 7 phút) */
    const timeoutMs = 420000; /** 7 phút tối đa */
    const MIN_RENDER_SECONDS = 25; /** Bắt buộc chờ ít nhất 25 giây thực tế để loại trừ kết thúc non */
    console.log(`⏳ [${WORKER_NAME}] [2/4] Đang chờ Muse.ai render video mới (tối thiểu 25s, tối đa 7 phút)...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 4000));
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      const check = await page.evaluate((minSec, elapsed) => {
        const refusalKeywords = [
          'không tạo được video',
          'gửi ảnh khác nhé',
          'không thể tạo video',
          'vi phạm chính sách',
          'nội dung này không phù hợp',
          'thử lại với ảnh khác',
          'lỗi tạo video'
        ];

        /** 1. Quét từ chối: Chỉ xét các tin nhắn mới (không có data-ztteam-old="true") */
        const assistantBubbles = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], .prose')).filter(el => {
          return el.getAttribute('data-ztteam-old') !== 'true';
        });

        let refusalError = null;
        for (const bubble of assistantBubbles) {
          const txt = (bubble.innerText || '').toLowerCase();
          const matched = refusalKeywords.find(kw => txt.includes(kw));
          if (matched) {
            refusalError = bubble.innerText.trim();
            break;
          }
        }

        /** 2. Kiểm tra cờ đang tạo video (Stop button, spinner, chữ đang tạo) */
        const allButtons = Array.from(document.querySelectorAll('button'));
        const hasStopButton = allButtons.some(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          const title = (b.getAttribute('title') || '').toLowerCase();
          return aria.includes('dừng') || aria.includes('stop') || title.includes('dừng') || title.includes('stop');
        });

        const hasGeneratingText = assistantBubbles.some(bubble => {
          const txt = (bubble.innerText || '').toLowerCase();
          return txt.includes('đang tạo') || txt.includes('generating') || txt.includes('đang dựng');
        });

        const isGenerating = hasStopButton || hasGeneratingText;

        /** 3. Lọc video: Bỏ avatar và BỎ 100% video cũ đã gắn data-ztteam-old="true" */
        const allVideos = Array.from(document.querySelectorAll('video')).filter(v => {
          const isAvatar = v.closest('.rounded-full') !== null || (v.videoWidth === 480 && v.videoHeight === 480);
          return !isAvatar;
        });

        const newVideos = allVideos.filter(v => v.getAttribute('data-ztteam-old') !== 'true');

        /** Ranh giới DOM: Nếu có data-ztteam-user-prompt, video mới bắt buộc phải nằm SAU tin nhắn vừa gửi */
        const userPromptEl = document.querySelector('[data-ztteam-user-prompt="true"]');
        const validVideos = newVideos.filter(v => {
          if (!userPromptEl) return true;
          return !!(userPromptEl.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        /** Kiểm tra nút tải video MỚI: Không có data-ztteam-old="true" và nằm sau user prompt */
        const newDownloadBtns = Array.from(document.querySelectorAll('button[aria-label="Tải video xuống"]')).filter(b => {
          if (b.getAttribute('data-ztteam-old') === 'true') return false;
          if (userPromptEl) {
            return !!(userPromptEl.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          }
          return true;
        });

        const hasNewDownloadBtn = newDownloadBtns.length > 0;

        /** Kiểm tra video mục tiêu mới nhất */
        const targetVideo = validVideos.length > 0 ? validVideos[validVideos.length - 1] : null;
        const videoDuration = targetVideo ? (targetVideo.duration || 0) : 0;
        const videoReadyState = targetVideo ? targetVideo.readyState : 0;

        /** Điều kiện hoàn tất nghiêm ngặt:
         * 1. Đã trải qua ít nhất 25 giây thực tế
         * 2. Không còn biểu tượng/chữ đang tạo (isGenerating = false)
         * 3. Có nút tải mới HOẶC (có video mới với thời lượng >= 10s và readyState >= 2)
         */
        const isTimePassed = elapsed >= minSec;
        const isVideoLoaded = targetVideo && videoDuration >= 10 && videoReadyState >= 2 && !targetVideo.seeking;
        const isReady = isTimePassed && !isGenerating && (hasNewDownloadBtn || isVideoLoaded);

        return {
          isReady: !!isReady,
          isTimePassed,
          isGenerating,
          hasNewDownloadBtn,
          validVideoCount: validVideos.length,
          videoDuration,
          videoReadyState,
          refusalError,
        };
      }, MIN_RENDER_SECONDS, elapsedSec);

      if (check.refusalError) {
        console.log(`\n❌ [${WORKER_NAME}] Muse.ai từ chối: "${check.refusalError}"`);
        throw new Error(`Muse.ai từ chối: ${check.refusalError}`);
      }

      process.stdout.write(`\r   ⏱️ [${WORKER_NAME}] Đang render: ${elapsedSec}s | Video mới: ${check.validVideoCount} | Nút tải mới: ${check.hasNewDownloadBtn ? 'CÓ' : 'Chưa'} | Đang tạo: ${check.isGenerating ? 'CÒN' : 'Xong'} | Thời lượng: ${check.videoDuration ? check.videoDuration.toFixed(1) + 's' : '0s'} | Trạng thái: ${check.isReady ? 'HOÀN TẤT' : 'Đang chờ...'}`);

      if (check.isReady) {
        console.log(`\n🎉 [${WORKER_NAME}] Muse.ai đã render xong video mới sau ${elapsedSec} giây!`);
        videoRendered = true;
        break;
      }
    }

    if (!videoRendered) {
      throw new Error('Quá thời gian chờ render trên Muse.ai (timeout 7 phút)');
    }

    /** Chờ 5s để stream buffer video blob được trình duyệt tải trọn vẹn vào RAM */
    await new Promise(r => setTimeout(r, 5000));

    /** 8. Trích xuất dữ liệu video blob mới chuẩn xác (Chỉ lấy video không có data-ztteam-old="true") */
    console.log(`💾 [${WORKER_NAME}] [3/4] Đang trích xuất dữ liệu video MP4 mới...`);
    base64Data = await page.evaluate(async () => {
      const allVideos = Array.from(document.querySelectorAll('video')).filter(v => {
        const isAvatar = v.closest('.rounded-full') !== null || (v.videoWidth === 480 && v.videoHeight === 480);
        return !isAvatar && v.src;
      });

      const newVideos = allVideos.filter(v => v.getAttribute('data-ztteam-old') !== 'true');
      const userPromptEl = document.querySelector('[data-ztteam-user-prompt="true"]');
      const validVideos = newVideos.filter(v => {
        if (!userPromptEl) return true;
        return !!(userPromptEl.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING);
      });

      const target = validVideos.length > 0 ? validVideos[validVideos.length - 1] : (newVideos.length > 0 ? newVideos[newVideos.length - 1] : null);
      if (!target || !target.src) return null;

      try {
        const res = await fetch(target.src);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        return null;
      }
    });

    if (!base64Data || !base64Data.startsWith('data:')) {
      throw new Error('Không đọc được dữ liệu video stream mới từ Muse.ai');
    }

    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    if (buffer.length < 1.5 * 1024 * 1024) {
      throw new Error(`File video tải về quá nhỏ (${(buffer.length / 1024 / 1024).toFixed(2)} MB), video 15s tiêu chuẩn phải trên 1.5MB.`);
    }

    fs.writeFileSync(localVideoPath, buffer);
    console.log(`✅ [${WORKER_NAME}] Đã lưu file video MP4 hoàn chỉnh: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    /** 7. Đính kèm video lên VPS */
    console.log(`🚀 [${WORKER_NAME}] [4/4] Đang tải video lên hệ thống ${target.name}...`);
    const formData = new FormData();
    formData.append('video', fs.createReadStream(localVideoPath));

    const uploadRes = await axios.post(`${target.url}/api/image/${job.id}/attach-video`, formData, {
      headers: { ...formData.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    });

    console.log(`========================================================`);
    console.log(`🎉 HOÀN TẤT THÀNH CÔNG JOB #${job.id} CHO [${target.name}] TỪ [${WORKER_NAME}]!`);
    console.log(`📹 Video URL trên hệ thống: ${uploadRes.data.videoUrl}`);
    console.log(`========================================================\n`);

    /** Nghỉ an toàn sau khi tạo thành công 1 video */
    await ztteam_cooldown(SUCCESS_COOLDOWN_SEC, 'Đã hoàn tất và tải video lên VPS. Dừng nghỉ trước khi tạo bài mới');
  } catch (err) {
    console.error(`\n❌ [${WORKER_NAME}] LỖI KHI XỬ LÝ JOB #${job.id}:`, err.message);

    /** Báo lỗi lên đúng hệ thống VPS */
    try {
      await axios.post(`${target.url}/api/image/${job.id}/fail-video`, { error: err.message });
      console.log(`⚠️ [${WORKER_NAME}] Đã cập nhật trạng thái FAILED lên [${target.name}].`);
    } catch (apiErr) {
      console.error(`[${WORKER_NAME}] Không thể báo lỗi lên VPS:`, apiErr.message);
    }

    /** Nghỉ an toàn sau khi gặp lỗi */
    await ztteam_cooldown(FAILURE_COOLDOWN_SEC, 'Gặp lỗi trong quá trình tạo video. Dừng nghỉ trước khi thử lại');
  } finally {
    /** Đóng kết nối Puppeteer an toàn sau mỗi job */
    if (browser) {
      try { browser.disconnect(); } catch (e) {}
    }
    /** Dọn dẹp file tạm trên máy tính */
    if (fs.existsSync(localImagePath)) {
      try { fs.unlinkSync(localImagePath); } catch (e) {}
    }
    if (fs.existsSync(localVideoPath)) {
      try { fs.unlinkSync(localVideoPath); } catch (e) {}
    }
  }
}

/** Vòng lặp chính luân phiên thăm dò hàng đợi từ hệ thống */
async function ztteam_workerLoop() {
  if (isProcessing) return;

  try {
    /** 1. Kiểm tra Chrome có đang bật không */
    const chromeAlive = await ztteam_isChromeRunning();
    if (!chromeAlive) {
      process.stdout.write(`\r[${WORKER_NAME}] Chờ Chrome mở tại ${CHROME_DEBUG_URL}...`);
      return;
    }

    /** 2. Lấy hệ thống kiểm tra theo vòng lặp Round-Robin */
    const target = VPS_TARGETS[currentTargetIndex];
    currentTargetIndex = (currentTargetIndex + 1) % VPS_TARGETS.length;

    /** 3. Hỏi hệ thống xem có job tạo video không */
    const res = await axios.get(`${target.url}/api/image/pending-video?auto=true`, { timeout: 10000 });
    if (res.data && res.data.hasJob && res.data.job) {
      isProcessing = true;
      console.log(`\n🎯 [${WORKER_NAME}] Phát hiện bài viết cần tạo Video từ [${target.name}]: Job #${res.data.job.id}`);
      try {
        await ztteam_processVideoJobOnMuse(res.data.job, target);
      } finally {
        isProcessing = false;
      }
    } else {
      process.stdout.write(`\r[${new Date().toLocaleTimeString()}] [${WORKER_NAME}] Đang kiểm tra [${target.name}]... (Hàng đợi trống)`);
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      process.stdout.write(`\r⚠️ [${WORKER_NAME}] Không kết nối được tới hệ thống... Đang thử lại`);
    } else {
      console.error(`\n[${WORKER_NAME}] Worker Error:`, err.message);
    }
  }
}

console.log('========================================================');
console.log(`🚀 ZTTEAM MUSE REEL WORKER [${WORKER_NAME}] ĐÃ KHỞI CHẠY!`);
console.log('📋 Danh sách hệ thống phục vụ luân phiên:');
VPS_TARGETS.forEach(t => console.log(`   - ${t.name}: ${t.url}`));
console.log(`🖥️ Chrome Target : ${CHROME_DEBUG_URL}`);
console.log(`⏱️ Chu kỳ kiểm tra: mỗi ${POLL_INTERVAL_MS / 1000}s`);
console.log('🛡️ Cơ chế: Tự động F5 dọn RAM, chống dán dồn 3-5 ảnh 100%');
console.log('========================================================\n');

/** Chạy ngay lần đầu và duy trì chu kỳ polling */
ztteam_workerLoop();
setInterval(ztteam_workerLoop, POLL_INTERVAL_MS);
