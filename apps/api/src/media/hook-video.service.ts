import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamAIService } from '../ai/ai.service';
import { ZTTeamBgmService } from './bgm.service';
import { TelegramService, ztteam_extractErrorMessage } from '../telegram/telegram.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ztteam_getVideosPath, ztteam_getImagesPath, ztteam_getSourceOriginalsPath } from '../common/ztteam_storage.util';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import puppeteer from 'puppeteer';
import axios from 'axios';

/**
 * Danh sách 6 bộ màu Dark Seamless sang trọng cho Video Reel
 * Tuyệt đối không dùng màu Hồng và Tím theo quy chuẩn ZTTeam
 */
export const ZTTEAM_REEL_PALETTES = [
  {
    name: 'Dark Teal / Cyan (Mặc định)',
    background: 'linear-gradient(180deg, #022a31 0%, #011d22 50%, #011114 100%)',
    highlightColor: '#f3c35b',
    accentBorder: '#f3c35b',
    avatarGrad: 'linear-gradient(135deg, #0a7075, #005f73)',
  },
  {
    name: 'Midnight Navy (Xanh Biển Sâu)',
    background: 'linear-gradient(180deg, #061e38 0%, #031224 50%, #020b17 100%)',
    highlightColor: '#f3c35b',
    accentBorder: '#f3c35b',
    avatarGrad: 'linear-gradient(135deg, #1d4ed8, #0369a1)',
  },
  {
    name: 'Dark Emerald (Xanh Ngọc Bích)',
    background: 'linear-gradient(180deg, #062b1e 0%, #031c13 50%, #010f0a 100%)',
    highlightColor: '#f3c35b',
    accentBorder: '#f3c35b',
    avatarGrad: 'linear-gradient(135deg, #059669, #065f46)',
  },
  {
    name: 'Obsidian Slate (Đen Xám Khói)',
    background: 'linear-gradient(180deg, #1c2128 0%, #13171d 50%, #0a0d12 100%)',
    highlightColor: '#f6c445',
    accentBorder: '#f6c445',
    avatarGrad: 'linear-gradient(135deg, #374151, #1f2937)',
  },
  {
    name: 'Smoked Espresso (Nâu Cà Phê Gỗ Mun)',
    background: 'linear-gradient(180deg, #2b1d0c 0%, #1a1107 50%, #0e0904 100%)',
    highlightColor: '#f3c35b',
    accentBorder: '#f3c35b',
    avatarGrad: 'linear-gradient(135deg, #78350f, #451a03)',
  },
  {
    name: 'Gunmetal Blue (Xám Xanh Nòng Súng)',
    background: 'linear-gradient(180deg, #112233 0%, #0b1622 50%, #060c14 100%)',
    highlightColor: '#f3c35b',
    accentBorder: '#f3c35b',
    avatarGrad: 'linear-gradient(135deg, #0284c7, #075985)',
  },
];

/**
 * Gán mỗi Fanpage 1 màu sắc cố định dựa trên thuật toán băm (Deterministic Hash)
 * Giúp mỗi Page luôn giữ đúng 1 màu nhận diện thương hiệu đặc trưng nhất quán
 */
export function ztteam_getPageReelPalette(pageIdOrName?: string) {
  if (!pageIdOrName) return ZTTEAM_REEL_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < pageIdOrName.length; i++) {
    hash = (hash << 5) - hash + pageIdOrName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ZTTEAM_REEL_PALETTES.length;
  return ZTTEAM_REEL_PALETTES[index];
}

@Injectable()
export class ZTTeamHookVideoService {
  private readonly logger = new Logger('ZTTeamHookVideoService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: ZTTeamAIService,
    private readonly bgmService: ZTTeamBgmService,
    private readonly telegramService: TelegramService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  /**
   * ZTTeam: Render video Reel 10s siêu sắc nét từ hình ảnh và kịch bản Hook 3 đoạn
   */
  async ztteam_renderHookVideo(
    imageId: string,
    options?: { bgmFilename?: string; forceRegenHook?: boolean }
  ): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
    this.logger.log(`===== START HOOK VIDEO RENDER: image=${imageId} =====`);

    const imageRecord = await this.prisma.ztteam_images.findUnique({
      where: { id: imageId },
      include: { page: true },
    });

    if (!imageRecord) {
      throw new Error(`Không tìm thấy bài viết ${imageId}`);
    }

    /** Cập nhật trạng thái đang xử lý */
    await this.prisma.ztteam_images.update({
      where: { id: imageId },
      data: { video_status: 'PENDING', error_log: null },
    });
    this.eventEmitter.emit('image.updated', { id: imageId, video_status: 'PENDING' });

    const tempDir = path.join(ztteam_getImagesPath(imageId), 'temp_hook_render');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let browser: any = null;

    try {
      /** 1. Chuẩn bị ảnh nguồn (Ưu tiên ảnh 2K output.png, sau đó đến image_url, cuối cùng là original.png) */
      const localImageCandidates = [
        path.join(ztteam_getImagesPath(imageId), 'output.png'),
        imageRecord.image_url ? path.join(process.cwd(), imageRecord.image_url.replace(/^\//, '')) : '',
        path.join(ztteam_getImagesPath(imageId), 'original.png'),
        path.join(ztteam_getSourceOriginalsPath(), `${imageRecord.wp_post_id}.jpg`),
      ].filter(p => p && fs.existsSync(p));

      let sourceImagePath = localImageCandidates[0];
      if (!sourceImagePath) {
        throw new Error('Không tìm thấy file ảnh gốc để render video');
      }

      const imageBase64 = fs.readFileSync(sourceImagePath).toString('base64');
      const imageExt = path.extname(sourceImagePath).replace('.', '') || 'png';
      const imageDataUri = `data:image/${imageExt};base64,${imageBase64}`;

      /** 2. Chuẩn bị thông tin Fanpage */
      const pageName = imageRecord.page?.name || 'ZTTeam Daily Story';
      let pageAvatarDataUri = '';
      if (imageRecord.page?.avatar) {
        try {
          if (imageRecord.page.avatar.startsWith('data:image')) {
            pageAvatarDataUri = imageRecord.page.avatar;
          } else if (imageRecord.page.avatar.startsWith('http://') || imageRecord.page.avatar.startsWith('https://')) {
            /** Tải ảnh avatar từ URL (Facebook Graph API) và chuyển thành Base64 Data URI */
            const res = await axios.get(imageRecord.page.avatar, {
              responseType: 'arraybuffer',
              timeout: 8000,
              maxRedirects: 5,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });
            const mimeType = res.headers['content-type'] || 'image/jpeg';
            const b64 = Buffer.from(res.data).toString('base64');
            pageAvatarDataUri = `data:${mimeType};base64,${b64}`;
          } else {
            const avatarLocal = path.join(process.cwd(), imageRecord.page.avatar.replace(/^\//, ''));
            if (fs.existsSync(avatarLocal)) {
              const avb64 = fs.readFileSync(avatarLocal).toString('base64');
              pageAvatarDataUri = `data:image/png;base64,${avb64}`;
            }
          }
        } catch (e: any) {
          this.logger.warn(`Không thể nạp avatar cho Fanpage "${pageName}": ${e?.message || e}`);
        }
      }

      /** 3. Tạo kịch bản Hook 3 đoạn bám sát nội dung gốc bằng AI */
      let hookHtml = '';
      const rawStory = imageRecord.ai_caption || imageRecord.wp_post_title || '';

      const aiResult = await this.aiService.ztteam_generateReelHookStory(
        imageRecord.wp_post_title || 'Compelling Mystery Story',
        rawStory
      );
      hookHtml = aiResult.hookHtml;

      /** 4. Tính toán Dynamic Typography dựa trên tổng số từ để căn chuẩn tuyệt đối */
      const plainText = hookHtml.replace(/<[^>]*>?/gm, '');
      const wordCount = plainText.trim().split(/\s+/).length;

      let fontSize = 36;
      let lineMarginBottom = 24;
      let textLineHeight = 1.48;

      if (wordCount <= 65) {
        fontSize = 38;
        lineMarginBottom = 26;
        textLineHeight = 1.5;
      } else if (wordCount > 90) {
        fontSize = 32;
        lineMarginBottom = 20;
        textLineHeight = 1.42;
      }

      /** 5. Xác định màu sắc cố định cho Fanpage nhận bài và Render Canvas qua Puppeteer */
      const pageKey = imageRecord.page?.id || imageRecord.page?.name || imageRecord.page_id || '';
      const pal = ztteam_getPageReelPalette(pageKey);
      this.logger.log(`[Reel Theme] Fanpage "${imageRecord.page?.name || 'Mặc định'}" sử dụng bộ màu cố định: ${pal.name}`);

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700;1,900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      font-family: 'Montserrat', sans-serif !important;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }

    /** VÙNG TRÊN 40.5% (774px) TRONG SUỐT ĐỂ LỘ VIDEO KEN BURNS ZOOM BÊN DƯỚI */
    .top-transparent-window {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 774px;
      background: transparent;
    }

    /** NỀN TỐI SANG TRỌNG KÉO DÀI 1146px XUỐNG ĐÁY */
    .section-bottom-seamless {
      position: absolute;
      top: 774px;
      left: 0;
      width: 1080px;
      height: 1146px;
      background: ${pal.background};
    }

    /** KHUNG NỘI DUNG */
    .content-container {
      position: absolute;
      top: 774px;
      left: 0;
      width: 1080px;
      height: 1146px;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
    }

    /** FANPAGE HEADER */
    .fanpage-header-row {
      width: 950px;
      margin-top: 36px;
      display: flex;
      align-items: center;
      gap: 22px;
    }

    .fanpage-avatar {
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: ${pal.avatarGrad};
      border: 3.5px solid ${pal.accentBorder};
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      flex-shrink: 0;
      object-fit: cover;
    }

    .fanpage-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .fanpage-name {
      font-size: 38px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      line-height: 1.15;
    }

    .fanpage-subtitle {
      font-size: 22px;
      font-weight: 500;
      color: #8ea5b0;
      line-height: 1.2;
    }

    /** ĐƯỜNG KẺ CHỈ VÀNG MẠ THANH MẢNH TRÊN */
    .gold-divider-top {
      width: 950px;
      height: 2px;
      margin-top: 24px;
      margin-bottom: 26px;
      background: linear-gradient(90deg, rgba(243,195,91,0.15) 0%, ${pal.accentBorder} 20%, ${pal.accentBorder} 80%, rgba(243,195,91,0.15) 100%);
      box-shadow: 0 0 10px rgba(243, 195, 91, 0.3);
    }

    /** HOOK BODY TYPOGRAPHY (MONTSERRAT 36px CĂN TRÁI) */
    .hook-body {
      width: 950px;
      display: flex;
      flex-direction: column;
    }

    .hook-p {
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: ${textLineHeight};
      color: #ffffff;
      text-align: left;
      letter-spacing: -0.2px;
      margin-bottom: ${lineMarginBottom}px;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
    }

    .hook-p:last-child {
      margin-bottom: 0;
    }

    .hl {
      color: ${pal.highlightColor} !important;
      font-weight: 800;
      text-shadow: 0 0 14px rgba(243, 195, 91, 0.35);
    }

    /** ĐƯỜNG KẺ CHỈ VÀNG MẠ THANH MẢNH DƯỚI */
    .gold-divider-bottom {
      width: 950px;
      height: 2px;
      margin-top: 6px;
      background: linear-gradient(90deg, rgba(243,195,91,0.15) 0%, ${pal.accentBorder} 20%, ${pal.accentBorder} 80%, rgba(243,195,91,0.15) 100%);
      box-shadow: 0 0 10px rgba(243, 195, 91, 0.3);
    }

    /** KHOẢNG ĐỆM TRÁNH NÚT REELS UI FACEBOOK */
    .reels-ui-bottom-spacer {
      height: 180px;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="top-transparent-window"></div>
  <div class="section-bottom-seamless"></div>

  <div class="content-container">
    <div class="fanpage-header-row">
      ${pageAvatarDataUri
          ? `<img src="${pageAvatarDataUri}" class="fanpage-avatar">`
          : `<div class="fanpage-avatar">${pageName.substring(0, 2).toUpperCase()}</div>`
        }
      <div class="fanpage-meta">
        <div class="fanpage-name">${pageName}</div>
        <div class="fanpage-subtitle">Facebook Creator • Viral Stories</div>
      </div>
    </div>

    <div class="gold-divider-top"></div>

    <div class="hook-body">
      ${aiResult.paragraphs.map(p => `<p class="hook-p">${p}</p>`).join('\n      ')}
    </div>

    <div class="gold-divider-bottom"></div>
    <div class="reels-ui-bottom-spacer"></div>
  </div>
</body>
</html>`;

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      await page.setContent(htmlContent, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');

      const overlayPngPath = path.join(tempDir, 'frame_overlay.png');
      await page.screenshot({ path: overlayPngPath, omitBackground: true, type: 'png' });
      await browser.close();
      browser = null;

      /** 6. Lấy file nhạc nền BGM từ thư viện */
      const preferredBgm = options?.bgmFilename || imageRecord.page?.default_bgm;
      const audioPath = this.bgmService.ztteam_resolveBgmPath(preferredBgm);

      /** 7. Render Video bằng FFmpeg với Cinematic Ken Burns Zoom (1.0 -> 1.035) chuẩn từ test_render_sharp_reel_video.js */
      const videosDir = ztteam_getVideosPath();
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }

      const timestamp = Date.now();
      const outputFilename = `hook_reel_${imageId}_${timestamp}.mp4`;
      const outputVideoPath = path.join(videosDir, outputFilename);
      const duration = 10;

      const ffmpegCmd = `ffmpeg -y -loop 1 -t ${duration} -i "${sourceImagePath}" -loop 1 -t ${duration} -i "${overlayPngPath}" -i "${audioPath}" -filter_complex "[0:v]scale=1080:-1:force_original_aspect_ratio=increase,crop=1080:774:0:0,scale='1080*(1+0.035*t/${duration})':-1:eval=frame:flags=bicubic,crop=1080:774:(in_w-1080)/2:0[fg];color=c=#011114:s=1080x1920:d=${duration}[base];[base][fg]overlay=0:0[with_img];[with_img][1:v]overlay=0:0[vout];[2:a]afade=t=in:st=0:d=0.4,afade=t=out:st=8.5:d=1.5,volume=0.9[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -b:v 8M -maxrate 12M -bufsize 16M -c:a aac -b:a 192k -shortest "${outputVideoPath}"`;

      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCmd, { maxBuffer: 1024 * 1024 * 30 }, (error, stdout, stderr) => {
          if (error) {
            this.logger.error(`FFmpeg render error: ${error.message}\n${stderr}`);
            reject(new Error(stderr || error.message));
          } else {
            this.logger.log(`FFmpeg render completed: ${outputFilename}`);
            resolve();
          }
        });
      });

      const videoUrl = `/storage/videos/${outputFilename}`;

      /** 8. Cập nhật kết quả vào database */
      const updated = await this.prisma.ztteam_images.update({
        where: { id: imageId },
        data: {
          video_url: videoUrl,
          video_status: 'COMPLETED',
          video_engine: 'hook_image',
          video_created_at: new Date(),
          error_log: null,
        },
      });

      this.eventEmitter.emit('image.updated', updated);

      /** Dọn dẹp frame tạm */
      try {
        if (fs.existsSync(overlayPngPath)) fs.unlinkSync(overlayPngPath);
      } catch (e) {
        /** Bỏ qua */
      }

      return { success: true, videoUrl };
    } catch (err: any) {
      this.logger.error(`Hook video render failed for ${imageId}: ${err.message}`);
      if (browser) {
        try { await browser.close(); } catch (e) { /** Bỏ qua */ }
      }

      await this.prisma.ztteam_images.update({
        where: { id: imageId },
        data: {
          video_status: 'FAILED',
          error_log: `Hook Render Error: ${err.message}`,
        },
      });

      this.eventEmitter.emit('image.updated', { id: imageId, video_status: 'FAILED' });

      /** Gửi thông báo lỗi chi tiết qua Telegram cho Admin */
      try {
        const extractedError = ztteam_extractErrorMessage(err);
        const postTitle = imageRecord?.wp_post_title || 'Bài viết #' + imageId;
        const pageTitle = imageRecord?.page?.name || 'Chưa gán Fanpage';
        const teleMessage = this.telegramService.ztteam_formatAlert({
          systemName: 'Render Video Hook (FFmpeg / AI)',
          fanpageName: pageTitle,
          postTitle,
          step: extractedError.toLowerCase().includes('openai') || extractedError.toLowerCase().includes('gpt')
            ? 'Bước 1/2: Tạo kịch bản 3 đoạn hook bằng OpenAI'
            : 'Bước 2/2: Ghép phụ đề, hiệu ứng Ken Burns & lồng nhạc nền bằng FFmpeg',
          rawError: extractedError,
          nextAction: 'Hệ thống đã tự động bỏ qua video này và tiếp tục xử lý các bài tiếp theo.',
        });
        await this.telegramService.ztteam_sendMessage(teleMessage);
      } catch (teleErr) {
        /** Bỏ qua nếu lỗi gửi Telegram */
      }

      return { success: false, error: ztteam_extractErrorMessage(err) };
    }
  }
}
