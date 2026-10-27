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
 * Danh sách 24 bộ màu Dark Seamless sang trọng, cao cấp cho Video Reel
 * Tuyệt đối không dùng màu Hồng và Tím theo quy chuẩn ZTTeam & AGENTS.md
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
  {
    name: 'Forest Pine (Xanh Rừng Thông)',
    background: 'linear-gradient(180deg, #08281a 0%, #051a11 50%, #03130c 100%)',
    highlightColor: '#34d399',
    accentBorder: '#10b981',
    avatarGrad: 'linear-gradient(135deg, #15803d, #064e3b)',
  },
  {
    name: 'Royal Sapphire (Xanh Lam Hoàng Gia)',
    background: 'linear-gradient(180deg, #0c2340 0%, #07172b 50%, #040f1c 100%)',
    highlightColor: '#60a5fa',
    accentBorder: '#3b82f6',
    avatarGrad: 'linear-gradient(135deg, #2563eb, #1e3a8a)',
  },
  {
    name: 'Charcoal Black (Đen Than Hoạt Tính)',
    background: 'linear-gradient(180deg, #18181b 0%, #101013 50%, #09090b 100%)',
    highlightColor: '#fbbf24',
    accentBorder: '#eab308',
    avatarGrad: 'linear-gradient(135deg, #52525b, #27272a)',
  },
  {
    name: 'Rustic Walnut (Nâu Gỗ Óc Chó)',
    background: 'linear-gradient(180deg, #331c0e 0%, #201108 50%, #140a05 100%)',
    highlightColor: '#f59e0b',
    accentBorder: '#d97706',
    avatarGrad: 'linear-gradient(135deg, #92400e, #451a03)',
  },
  {
    name: 'Deep Abyss (Xanh Thẳm Đại Dương)',
    background: 'linear-gradient(180deg, #071a2c 0%, #04101c 50%, #020912 100%)',
    highlightColor: '#38bdf8',
    accentBorder: '#0284c7',
    avatarGrad: 'linear-gradient(135deg, #0369a1, #082f49)',
  },
  {
    name: 'Jade Green (Xanh Ngọc Thạch)',
    background: 'linear-gradient(180deg, #0a2e23 0%, #051d16 50%, #03140f 100%)',
    highlightColor: '#4ade80',
    accentBorder: '#22c55e',
    avatarGrad: 'linear-gradient(135deg, #16a34a, #14532d)',
  },
  {
    name: 'Dark Copper (Đồng Đỏ Trầm)',
    background: 'linear-gradient(180deg, #351a10 0%, #22100a 50%, #150a06 100%)',
    highlightColor: '#fb923c',
    accentBorder: '#ea580c',
    avatarGrad: 'linear-gradient(135deg, #b45309, #7c2d12)',
  },
  {
    name: 'Titanium Gray (Xám Titan Ánh Kim)',
    background: 'linear-gradient(180deg, #1e293b 0%, #131b27 50%, #0b0f17 100%)',
    highlightColor: '#38bdf8',
    accentBorder: '#0ea5e9',
    avatarGrad: 'linear-gradient(135deg, #475569, #1e293b)',
  },
  {
    name: 'Golden Bronze (Đồng Vàng Ánh Kim)',
    background: 'linear-gradient(180deg, #2a200b 0%, #1b1407 50%, #110d04 100%)',
    highlightColor: '#facc15',
    accentBorder: '#eab308',
    avatarGrad: 'linear-gradient(135deg, #a16207, #713f12)',
  },
  {
    name: 'Deep Olive (Xanh Rêu Quân Đội)',
    background: 'linear-gradient(180deg, #1e2610 0%, #13190a 50%, #0c1006 100%)',
    highlightColor: '#a3e635',
    accentBorder: '#84cc16',
    avatarGrad: 'linear-gradient(135deg, #4d7c0f, #365314)',
  },
  {
    name: 'Midnight Cobalt (Xanh Lam Đêm Muộn)',
    background: 'linear-gradient(180deg, #0f172a 0%, #080d19 50%, #020617 100%)',
    highlightColor: '#93c5fd',
    accentBorder: '#3b82f6',
    avatarGrad: 'linear-gradient(135deg, #1d4ed8, #0f172a)',
  },
  {
    name: 'Dark Amber (Hổ Phách Sẫm)',
    background: 'linear-gradient(180deg, #2e1b09 0%, #1d1105 50%, #120a03 100%)',
    highlightColor: '#f59e0b',
    accentBorder: '#d97706',
    avatarGrad: 'linear-gradient(135deg, #b45309, #78350f)',
  },
  {
    name: 'Smoky Quartz (Thạch Anh Khói)',
    background: 'linear-gradient(180deg, #202024 0%, #151518 50%, #0d0d10 100%)',
    highlightColor: '#e2e8f0',
    accentBorder: '#94a3b8',
    avatarGrad: 'linear-gradient(135deg, #64748b, #334155)',
  },
  {
    name: 'Burgundy Dusk (Đỏ Rượu Vang Trầm)',
    background: 'linear-gradient(180deg, #2e1114 0%, #1d090b 50%, #130608 100%)',
    highlightColor: '#fca5a5',
    accentBorder: '#ef4444',
    avatarGrad: 'linear-gradient(135deg, #991b1b, #450a0a)',
  },
  {
    name: 'Oceanic Slate (Xanh Xám Sóng Ngầm)',
    background: 'linear-gradient(180deg, #0f242c 0%, #09171c 50%, #050f13 100%)',
    highlightColor: '#2dd4bf',
    accentBorder: '#0d9488',
    avatarGrad: 'linear-gradient(135deg, #0f766e, #134e4a)',
  },
  {
    name: 'Dark Terracotta (Đất Nung Đêm Sẫm)',
    background: 'linear-gradient(180deg, #31170d 0%, #1f0e08 50%, #130905 100%)',
    highlightColor: '#fdba74',
    accentBorder: '#f97316',
    avatarGrad: 'linear-gradient(135deg, #c2410c, #7c2d12)',
  },
  {
    name: 'Nordic Shadow (Bóng Tối Bắc Âu)',
    background: 'linear-gradient(180deg, #151d28 0%, #0e131b 50%, #080c10 100%)',
    highlightColor: '#7dd3fc',
    accentBorder: '#0284c7',
    avatarGrad: 'linear-gradient(135deg, #0369a1, #0c4a6e)',
  },
  {
    name: 'Iron Carbon (Thép Carbon Đen Sâu)',
    background: 'linear-gradient(180deg, #14171a 0%, #0c0e10 50%, #070809 100%)',
    highlightColor: '#fcd34d',
    accentBorder: '#f59e0b',
    avatarGrad: 'linear-gradient(135deg, #4b5563, #111827)',
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

/**
 * ZTTeam: 3 bộ tông màu điện ảnh cao cấp cho Text Story Reel (Tuyệt đối KHÔNG dùng màu Hồng/Tím)
 */
export const ZTTEAM_TEXT_STORY_THEMES = [
  {
    id: 'style1_cyan',
    name: 'Midnight Teal & Cyan',
    bgGradient: 'radial-gradient(ellipse at 85% 15%, #072635 0%, #030d15 45%, #010408 100%)',
    aura1: 'rgba(6, 182, 212, 0.55)',
    aura2: 'rgba(13, 148, 136, 0.60)',
    aura3: 'rgba(217, 119, 6, 0.40)',
    cardBg: 'rgba(6, 20, 32, 0.46)',
    cardBorder: '1.8px solid rgba(56, 189, 248, 0.35)',
    cardGlow: '0 32px 85px rgba(0, 0, 0, 0.88), 0 0 45px rgba(6, 182, 212, 0.22)',
    hookColor: '#fbbf24',
    hlColor: '#fbbf24',
    textColor: '#e2e8f0',
    ctaColor: '#38bdf8',
    verifiedColor: '#1877F2',
  },
  {
    id: 'style2_amber',
    name: 'Obsidian Bronze & Champagne Gold',
    bgGradient: 'radial-gradient(ellipse at 75% 20%, #2a1a08 0%, #0f0a04 45%, #030201 100%)',
    aura1: 'rgba(245, 158, 11, 0.52)',
    aura2: 'rgba(180, 83, 9, 0.60)',
    aura3: 'rgba(30, 41, 59, 0.65)',
    cardBg: 'rgba(24, 16, 9, 0.48)',
    cardBorder: '1.8px solid rgba(245, 158, 11, 0.38)',
    cardGlow: '0 32px 85px rgba(0, 0, 0, 0.9), 0 0 45px rgba(245, 158, 11, 0.25)',
    hookColor: '#fde047',
    hlColor: '#fde047',
    textColor: '#f1ede6',
    ctaColor: '#fbbf24',
    verifiedColor: '#1877F2',
  },
  {
    id: 'style3_cobalt',
    name: 'Deep Space Cobalt & Electric Cyan',
    bgGradient: 'radial-gradient(ellipse at 80% 25%, #0c204c 0%, #040c1e 45%, #01040c 100%)',
    aura1: 'rgba(37, 99, 235, 0.52)',
    aura2: 'rgba(14, 165, 233, 0.55)',
    aura3: 'rgba(30, 58, 138, 0.62)',
    cardBg: 'rgba(8, 18, 42, 0.46)',
    cardBorder: '1.8px solid rgba(96, 165, 250, 0.38)',
    cardGlow: '0 32px 85px rgba(0, 0, 0, 0.88), 0 0 45px rgba(37, 99, 235, 0.25)',
    hookColor: '#facc15',
    hlColor: '#facc15',
    textColor: '#e6edf5',
    ctaColor: '#60a5fa',
    verifiedColor: '#1877F2',
  },
];

export function ztteam_getTextStoryTheme(pageIdOrName?: string) {
  if (!pageIdOrName) return ZTTEAM_TEXT_STORY_THEMES[0];
  let hash = 0;
  for (let i = 0; i < pageIdOrName.length; i++) {
    hash = (hash << 5) - hash + pageIdOrName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ZTTEAM_TEXT_STORY_THEMES.length;
  return ZTTEAM_TEXT_STORY_THEMES[index];
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
   * ZTTeam: Render video Reel 10s siêu sắc nét từ hình ảnh Hook hoặc Text Story (3 Style templates)
   */
  async ztteam_renderHookVideo(
    imageId: string,
    options?: {
      bgmFilename?: string;
      forceRegenHook?: boolean;
      videoEngine?: string;
      forceRegenContent?: boolean;
      templateStyle?: 'vintage_paper' | 'parchment_gold' | 'botanical_sage' | 'frosted_glass';
      force?: boolean;
    }
  ): Promise<{ success: boolean; videoUrl?: string; error?: string; message?: string }> {
    this.logger.log(`===== START HOOK/TEXT STORY VIDEO RENDER: image=${imageId} =====`);

    const imageRecord = await this.prisma.ztteam_images.findUnique({
      where: { id: imageId },
      include: { page: true },
    });

    if (!imageRecord) {
      throw new Error(`Không tìm thấy bài viết ${imageId}`);
    }

    /** ZTTeam: Video nào đã đăng rồi (is_posted = true hoặc status = 'POSTED') TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP RENDER LẠI */
    if (imageRecord.is_posted || imageRecord.status === 'POSTED') {
      this.logger.warn(`Bài viết ${imageId} đã được đăng lên Facebook (is_posted: ${imageRecord.is_posted}, status: ${imageRecord.status}). Tuyệt đối cấm render lại!`);
      return { success: true, videoUrl: imageRecord.video_url || undefined, message: 'Bài viết đã đăng lên Facebook, cấm render lại.' };
    }

    /** ZTTeam: Page đã tắt hoặc bị chặn thì tuyệt đối không render video */
    if (imageRecord.page) {
      const isPageInactive = imageRecord.page.is_active === false;
      const isAutoPublishDisabled = imageRecord.page.auto_publish_enabled === false;
      const isTokenBlocked = imageRecord.page.token_status && imageRecord.page.token_status !== 'active';

      if (isPageInactive || isAutoPublishDisabled || isTokenBlocked) {
        this.logger.warn(`[HOOK RENDER BLOCKED] Fanpage "${imageRecord.page.name}" đang tắt hoặc bị chặn (is_active: ${imageRecord.page.is_active}, auto_publish: ${imageRecord.page.auto_publish_enabled}, token_status: ${imageRecord.page.token_status}). Bỏ qua bài ${imageId}.`);
        return {
          success: true,
          videoUrl: imageRecord.video_url || undefined,
          message: `Fanpage đang tắt hoặc bị chặn (${imageRecord.page.token_status || 'disabled'}), không render video.`,
        };
      }
    }

    /** ZTTeam: Kiểm tra nếu bài viết đang được render (PROCESSING) trong vòng 2 phút gần đây thì bỏ qua */
    if (imageRecord.video_status === 'PROCESSING' && !options?.force) {
      const isRecentlyProcessing = imageRecord.updated_at && (Date.now() - new Date(imageRecord.updated_at).getTime() < 120000);
      if (isRecentlyProcessing) {
        this.logger.warn(`Bài viết ${imageId} đang trong quá trình render (PROCESSING). Bỏ qua để tránh xung đột.`);
        return {
          success: false,
          message: 'Bài viết đang được xử lý tạo video bởi một tiến trình khác.',
        };
      }
    }

    /** Cập nhật trạng thái đang xử lý PROCESSING */
    await this.prisma.ztteam_images.update({
      where: { id: imageId },
      data: { video_status: 'PROCESSING', error_log: null },
    });
    this.eventEmitter.emit('image.updated', { id: imageId, video_status: 'PROCESSING' });

    const tempDir = path.join(ztteam_getImagesPath(imageId), 'temp_hook_render');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let browser: any = null;
    try {
      /** ZTTeam: Khai tử hoàn toàn định dạng hook_image, ép 100% video sang Text Story 3 mẫu mới */
      const engine = 'text_story';

      /** 1. Chuẩn bị ảnh nguồn (đối với hook_image thì bắt buộc, text_story có thể linh hoạt) */
      const localImageCandidates = [
        path.join(ztteam_getImagesPath(imageId), 'output.png'),
        imageRecord.image_url ? path.join(process.cwd(), imageRecord.image_url.replace(/^\//, '')) : '',
        path.join(ztteam_getImagesPath(imageId), 'original.png'),
        path.join(ztteam_getSourceOriginalsPath(), `${imageRecord.wp_post_id}.jpg`),
      ].filter(p => p && fs.existsSync(p));

      let sourceImagePath = localImageCandidates[0];
      if (!sourceImagePath && engine !== 'text_story') {
        throw new Error('Không tìm thấy file ảnh gốc để render video');
      }

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

      /** =========================================================================
       * NHÁNH 1: ĐỊNH DẠNG TEXT STORY REEL (FROSTED GLASS CARD 9:16, ĐÁY CHỪA 10%)
       * ========================================================================= */
      if (engine === 'text_story') {
        const pageKey = imageRecord.page?.id || imageRecord.page?.name || imageRecord.page_id || 'ztteam_story';
        const theme = ztteam_getTextStoryTheme(pageKey);
        this.logger.log(`[Text Story Reel] Fanpage "${pageName}" sử dụng bộ theme: ${theme.name}`);

        /** Lấy toàn bộ cốt truyện từ ai_script hoặc kết hợp caption + first_comment */
        const rawStory = imageRecord.ai_script || (imageRecord.ai_caption + '\n\n' + (imageRecord.ai_first_comment || '')) || imageRecord.wp_post_title || '';

        /** ZTTeam: Kiểm tra xem đã có kịch bản story_card_data.json lưu sẵn trong thư mục bài viết chưa */
        const storyDataFile = path.join(ztteam_getImagesPath(imageId), 'story_card_data.json');
        let storyData: { hookQuote: string; paragraphs: string[]; plainText: string } | null = null;

        if (fs.existsSync(storyDataFile) && !options?.forceRegenContent) {
          try {
            storyData = JSON.parse(fs.readFileSync(storyDataFile, 'utf-8'));
            /** ZTTeam: Kiểm tra nếu kịch bản cũ là do fallback cào thô, lặp tiêu đề 2 lần, hoặc thiếu highlight thì bắt buộc hủy bỏ để AI tạo mới */
            const textCheck = (storyData?.hookQuote || '') + ' ' + (storyData?.paragraphs || []).join(' ');
            const hookQ = (storyData?.hookQuote || '').trim();
            const p0 = ((storyData?.paragraphs && storyData?.paragraphs[0]) || '').trim();
            const cleanTitle = (imageRecord.wp_post_title || '').replace(/[^\w\s]/g, '').toLowerCase().trim();
            const cleanHook = hookQ.replace(/[^\w\s]/g, '').toLowerCase().trim();
            const cleanP0 = p0.replace(/<[^>]*>/g, '').replace(/[^\w\s]/g, '').toLowerCase().trim();

            const hookIsTitle = cleanTitle.length > 15 && cleanHook.length > 15 && (cleanHook === cleanTitle || cleanHook.startsWith(cleanTitle.substring(0, 30)));
            const p0IsTitle = cleanTitle.length > 15 && cleanP0.startsWith(cleanTitle.substring(0, 25));
            const p0IsHook = cleanHook.length > 15 && cleanP0.startsWith(cleanHook.substring(0, 25));
            const p0IsUpper = p0.replace(/<[^>]*>/g, '').trim().length > 25 && p0.replace(/<[^>]*>/g, '').trim().substring(0, 30) === p0.replace(/<[^>]*>/g, '').trim().substring(0, 30).toUpperCase();
            const hasHighlight = textCheck.includes('<span class="hl">');
            const hasCTA = textCheck.includes('CONTINUED IN THE COMMENTS') || textCheck.includes('👇');

            const isFallbackData = !hasHighlight || hasCTA || hookIsTitle || p0IsTitle || p0IsHook || p0IsUpper || (hookQ && hookQ === hookQ.toUpperCase() && hookQ.length > 20);

            if (isFallbackData) {
              this.logger.warn(`[Text Story Reel] Kịch bản bài ${imageId} dính bài cào thô/lặp title. Tự động hủy cache để AI tạo kịch bản mới 100%!`);
              storyData = null;
            } else {
              this.logger.log(`[Text Story Reel] Tái sử dụng kịch bản AI đạt chuẩn cho bài viết ${imageId}`);
            }
          } catch (readErr: any) {
            storyData = null;
          }
        }

        if (!storyData || !storyData.paragraphs || storyData.paragraphs.length === 0) {
          this.logger.log(`[Text Story Reel] Gọi Gemini API tạo kịch bản mới cho bài viết ${imageId}`);
          storyData = await this.aiService.ztteam_generateTextStoryCardContent(
            imageRecord.wp_post_title || 'Compelling Story',
            rawStory
          );
          try {
            fs.writeFileSync(storyDataFile, JSON.stringify(storyData, null, 2), 'utf-8');
          } catch (writeErr: any) {
            this.logger.warn(`Không thể ghi file story_card_data.json: ${writeErr.message}`);
          }
        }

        /** ZTTeam: Cân chỉnh kích thước chữ động (Fluid Typography) theo độ dài nội dung để luôn lấp đầy 90-95% thẻ */
        const wordCount = storyData.plainText.trim().split(/\s+/).length;
        let hookFontSize = 46;
        let fontSize = 38;
        let lineHeight = 1.34;
        let pGap = 18;

        if (wordCount < 150) {
          /** Cực ngắn: Tăng mạnh kích thước chữ để lấp đầy thẻ và siêu dễ đọc */
          hookFontSize = 54;
          fontSize = 46;
          lineHeight = 1.40;
          pGap = 26;
        } else if (wordCount < 185) {
          /** Ngắn - Vừa: Tăng chữ to rõ ràng */
          hookFontSize = 50;
          fontSize = 42;
          lineHeight = 1.36;
          pGap = 22;
        } else if (wordCount <= 225) {
          /** Chuẩn (185 - 225 từ) */
          hookFontSize = 46;
          fontSize = 38;
          lineHeight = 1.32;
          pGap = 18;
        } else {
          /** Dài (> 225 từ): Thu gọn vừa vặn không tràn */
          hookFontSize = 42;
          fontSize = 34;
          lineHeight = 1.28;
          pGap = 14;
        }

        /** ZTTeam: Chọn Style template (vintage_paper / parchment_gold / botanical_sage / frosted_glass) */
        const availableStyles: ('vintage_paper' | 'parchment_gold' | 'botanical_sage' | 'frosted_glass')[] = [
          'vintage_paper',
          'parchment_gold',
          'botanical_sage',
          'frosted_glass',
        ];

        let selectedStyle = options?.templateStyle || (imageRecord.page?.default_reel_template_id as any);
        if (!selectedStyle || !availableStyles.includes(selectedStyle)) {
          selectedStyle = 'frosted_glass';
        }

        this.logger.log(`[Text Story Reel] Fanpage "${pageName}" sử dụng Style Template: ${selectedStyle}`);

        let htmlContent = '';
        if (selectedStyle === 'vintage_paper') {
          htmlContent = this.ztteam_buildVintagePaperHtml(storyData, pageAvatarDataUri, fontSize, lineHeight, pGap);
        } else if (selectedStyle === 'parchment_gold') {
          htmlContent = this.ztteam_buildParchmentGoldHtml(storyData, pageAvatarDataUri, fontSize, lineHeight, pGap);
        } else if (selectedStyle === 'botanical_sage') {
          htmlContent = this.ztteam_buildBotanicalSageHtml(storyData, pageAvatarDataUri, fontSize, lineHeight, pGap);
        } else {
          htmlContent = this.ztteam_buildFrostedGlassHtml(storyData, pageAvatarDataUri, theme, pageName, hookFontSize, fontSize, lineHeight, pGap);
        }

        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        try {
          await page.evaluateHandle('document.fonts.ready');
        } catch (fontErr) { /** Bỏ qua */ }
        await new Promise(r => setTimeout(r, 600));

        /** ZTTeam: Thuật toán Auto-Fit tự động tối ưu hóa cỡ chữ để nội dung phủ kín 90-95% thẻ */
        try {
          await page.evaluate(() => {
            const body = document.getElementById('storyBody');
            const container = (document.querySelector('.content-card') || document.querySelector('.glass-card')) as HTMLElement;
            if (!body || !container) return;

            const header = (document.querySelector('.header-bar') || document.querySelector('.external-header')) as HTMLElement;
            const footer = (document.querySelector('.bottom-section') || document.querySelector('.cta-container') || document.querySelector('.cta-row')) as HTMLElement;
            const headerHeight = header ? header.offsetHeight : 100;
            const footerHeight = footer ? footer.offsetHeight : 80;

            const availableHeight = container.clientHeight - headerHeight - footerHeight - 110;

            let low = 24, high = 46, best = 32;
            for (let i = 0; i < 8; i++) {
              const mid = Math.round((low + high) / 2);
              body.style.fontSize = mid + 'px';
              body.style.lineHeight = (mid > 34 ? '1.28' : '1.32');

              const currentHeight = body.scrollHeight;
              if (currentHeight <= availableHeight) {
                best = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            body.style.fontSize = best + 'px';
            body.style.lineHeight = (best > 34 ? '1.28' : '1.32');
          });
        } catch (evalErr) {
          /** Bỏ qua nếu evaluate lỗi */
        }
        await new Promise(r => setTimeout(r, 400));

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const framePngPath = path.join(tempDir, `frame_${uniqueSuffix}.png`);
        await page.screenshot({ path: framePngPath, omitBackground: false, type: 'png' });
        await browser.close();
        browser = null;

        if (!fs.existsSync(framePngPath)) {
          throw new Error('Lỗi Puppeteer: File text_story frame không được tạo thành công.');
        }

        const preferredBgm = options?.bgmFilename || imageRecord.page?.default_bgm || 'kiss_of_spring.mp4';
        const audioPath = this.bgmService.ztteam_resolveBgmPath(preferredBgm);

        const videosDir = ztteam_getVideosPath();
        if (!fs.existsSync(videosDir)) {
          fs.mkdirSync(videosDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputFilename = `text_story_reel_${imageId}_${timestamp}.mp4`;
        const outputVideoPath = path.join(videosDir, outputFilename);
        const duration = 10;

        const ffmpegCmd = `ffmpeg -y -loop 1 -t ${duration} -i "${framePngPath}" -t ${duration} -i "${audioPath}" -filter_complex "[0:v]scale='1080*(1+0.025*t/${duration})':-1:eval=frame:flags=bicubic,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2[vout];[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${duration - 1.5}:d=1.5,volume=0.85[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -b:v 8M -maxrate 12M -bufsize 16M -c:a aac -b:a 192k -t ${duration} "${outputVideoPath}"`;

        await new Promise<void>((resolve, reject) => {
          exec(ffmpegCmd, { maxBuffer: 1024 * 1024 * 30 }, (error, stdout, stderr) => {
            if (error) {
              const cleanStderr = (stderr || error.message || '').trim();
              const lines = cleanStderr.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('ffmpeg version') && !l.startsWith('built with') && !l.startsWith('configuration:'));
              const actualError = lines.slice(-3).join(' | ') || error.message;
              this.logger.error(`FFmpeg text story render error: ${error.message}\n${cleanStderr}`);
              reject(new Error(actualError));
            } else {
              this.logger.log(`FFmpeg text story render completed: ${outputFilename}`);
              resolve();
            }
          });
        });

        const videoUrl = `/storage/videos/${outputFilename}`;

        const updated = await this.prisma.ztteam_images.update({
          where: { id: imageId },
          data: {
            video_url: videoUrl,
            video_status: 'COMPLETED',
            video_engine: 'text_story',
            video_created_at: new Date(),
            error_log: null,
          },
        });

        this.eventEmitter.emit('image.updated', updated);

        try {
          if (fs.existsSync(framePngPath)) fs.unlinkSync(framePngPath);
        } catch (e) { /** Bỏ qua */ }

        return { success: true, videoUrl };
      }

      /** =========================================================================
       * NHÁNH 2: ĐỊNH DẠNG HOOK IMAGE REEL (ẢNH 2K + 3 ĐOẠN HOOK MONTSERRAT)
       * ========================================================================= */
      const imageBase64 = fs.readFileSync(sourceImagePath).toString('base64');
      const imageExt = path.extname(sourceImagePath).replace('.', '') || 'png';
      const imageDataUri = `data:image/${imageExt};base64,${imageBase64}`;

      /** 3. Tạo kịch bản Hook 3 đoạn bám sát nội dung gốc bằng AI */
      let hookHtml = '';
      const rawStory = imageRecord.ai_script || (imageRecord.ai_caption + '\n\n' + (imageRecord.ai_first_comment || '')) || imageRecord.wp_post_title || '';

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

      const uniqueOverlaySuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const overlayPngPath = path.join(tempDir, `overlay_${uniqueOverlaySuffix}.png`);
      await page.screenshot({ path: overlayPngPath, omitBackground: true, type: 'png' });
      await browser.close();
      browser = null;

      if (!fs.existsSync(overlayPngPath)) {
        throw new Error('Lỗi Puppeteer: File frame overlay không được tạo thành công.');
      }

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

      const ffmpegCmd = `ffmpeg -y -loop 1 -t ${duration} -i "${sourceImagePath}" -loop 1 -t ${duration} -i "${overlayPngPath}" -t ${duration} -i "${audioPath}" -filter_complex "[0:v]scale=1080:774:force_original_aspect_ratio=increase,crop=1080:774:(in_w-1080)/2:(in_h-774)/2,scale='1080*(1+0.035*t/${duration})':-1:eval=frame:flags=bicubic,crop=1080:774:(in_w-1080)/2:(in_h-774)/2[fg];color=c=#011114:s=1080x1920:d=${duration}[base];[base][fg]overlay=0:0[with_img];[with_img][1:v]overlay=0:0[vout];[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.4,afade=t=out:st=${duration - 1.5}:d=1.5,volume=0.9[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -b:v 8M -maxrate 12M -bufsize 16M -c:a aac -b:a 192k -t ${duration} "${outputVideoPath}"`;

      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCmd, { maxBuffer: 1024 * 1024 * 30 }, (error, stdout, stderr) => {
          if (error) {
            const cleanStderr = (stderr || error.message || '').trim();
            const lines = cleanStderr.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('ffmpeg version') && !l.startsWith('built with') && !l.startsWith('configuration:'));
            const actualError = lines.slice(-3).join(' | ') || error.message;
            this.logger.error(`FFmpeg render error: ${error.message}\n${cleanStderr}`);
            reject(new Error(actualError));
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
          step: /openai|gpt|gemini|google|deepseek|ai/i.test(extractedError)
            ? 'Bước 1/2: Tạo kịch bản 3 đoạn hook bằng AI'
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

  /**
   * ZTTeam: Mẫu 1 - Vintage Paper & Deep Crimson Highlight
   * Giấy sách cổ điển, viền đôi ngoài, chữ Oswald đậm, trích dẫn đỏ thẫm Burgundy, nút Continue Reading
   */
  private ztteam_buildVintagePaperHtml(
    storyData: { hookQuote: string; paragraphs: string[]; plainText: string },
    pageAvatarDataUri: string,
    fontSize: number,
    lineHeight: number,
    pGap: number
  ): string {
    const avatarHtml = pageAvatarDataUri
      ? `<img src="${pageAvatarDataUri}" alt="Avatar" />`
      : `<svg class="avatar-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#d4c2aa"/><circle cx="50" cy="40" r="20" fill="#755a3d"/><circle cx="50" cy="85" r="32" fill="#755a3d"/></svg>`;

    /** ZTTeam: Fluid typography tối ưu riêng cho phông Oswald (Condensed) */
    const wordCount = storyData.plainText.trim().split(/\s+/).length;
    let actualFontSize = 33;
    let actualLineHeight = 1.30;
    let actualPGap = 16;

    if (wordCount < 130) {
      actualFontSize = 38;
      actualLineHeight = 1.34;
      actualPGap = 22;
    } else if (wordCount < 170) {
      actualFontSize = 35;
      actualLineHeight = 1.32;
      actualPGap = 18;
    } else if (wordCount <= 215) {
      actualFontSize = 31;
      actualLineHeight = 1.28;
      actualPGap = 15;
    } else {
      actualFontSize = 28;
      actualLineHeight = 1.25;
      actualPGap = 12;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: #e4d8c7;
      overflow: hidden;
      position: relative;
      font-family: 'Oswald', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    /** KHUNG VIỀN ĐÔI TRANG GIẤY CỔ ĐIỂN */
    .outer-border {
      position: absolute;
      top: 28px;
      left: 28px;
      right: 28px;
      bottom: 28px;
      border: 2px solid rgba(175, 155, 135, 0.65);
      border-radius: 40px;
      pointer-events: none;
      z-index: 10;
    }
    .outer-border-inner {
      position: absolute;
      top: 38px;
      left: 38px;
      right: 38px;
      bottom: 38px;
      border: 1px dashed rgba(175, 155, 135, 0.5);
      border-radius: 34px;
      pointer-events: none;
      z-index: 10;
    }

    /** CARD NỘI DUNG GIẤY KEM SÁNG */
    .content-card {
      width: 960px;
      height: 1720px;
      background: #fbf8f2;
      border-radius: 38px;
      box-shadow: 0 25px 70px rgba(90, 70, 50, 0.18), 0 4px 16px rgba(90, 70, 50, 0.08);
      padding: 50px 60px 40px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      z-index: 5;
      border: 1px solid rgba(220, 210, 195, 0.7);
    }

    /** HEADER PROFILE (CHỈ AVATAR BLUR + VỆT CHE TÊN ĐỎ THẪM) */
    .header-bar {
      display: flex;
      align-items: center;
      gap: 22px;
      margin-bottom: 20px;
    }
    .avatar-wrapper {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid #d8cbbe;
      box-shadow: 0 4px 14px rgba(0,0,0,0.1);
      flex-shrink: 0;
      position: relative;
    }
    .avatar-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(8px);
      transform: scale(1.25);
    }
    .avatar-svg {
      width: 100%;
      height: 100%;
      filter: blur(4px);
    }
    .censor-brush {
      width: 360px;
      height: 34px;
      background: #731e25;
      border-radius: 8px 16px 12px 18px;
      transform: rotate(-0.5deg);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.25);
    }
    .header-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .brand-zt {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #7c6b58;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding-left: 4px;
    }

    /** NỘI DUNG CÂU CHUYỆN (FLEX 1 DÀN ĐỀU PHỦ KÍN THẺ) */
    .story-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #1a1918;
      font-size: ${actualFontSize}px;
      font-weight: 700;
      line-height: ${actualLineHeight};
      letter-spacing: -0.2px;
      margin-bottom: 25px;
    }
    .story-paragraph {
      margin: 0;
    }
    .highlight-red, .hl {
      color: #8b1d20 !important;
      font-weight: 700;
    }

    /** NÚT CTA CONTINUE READING (CĂN GIỮA DƯỚI ĐÁY) */
    .cta-container {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
      padding-top: 10px;
    }
    .cta-pill {
      background: #ded4c5;
      border: 2px solid #c2b49f;
      border-radius: 9999px;
      padding: 16px 56px;
      font-family: 'Montserrat', sans-serif;
      font-size: 27px;
      font-weight: 800;
      color: #2b251f;
      box-shadow: 0 4px 12px rgba(60, 45, 30, 0.12);
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="outer-border"></div>
  <div class="outer-border-inner"></div>

  <div class="content-card">
    <div class="header-bar">
      <div class="avatar-wrapper">
        ${avatarHtml}
      </div>
      <div class="header-col">
        <div class="censor-brush"></div>
        <div class="brand-zt">ZT</div>
      </div>
    </div>

    <div class="story-body" id="storyBody">
      ${storyData.hookQuote ? `<p class="story-paragraph highlight-red">${storyData.hookQuote}</p>` : ''}
      ${storyData.paragraphs.map(p => `<p class="story-paragraph">${p}</p>`).join('\n      ')}
    </div>

    <div class="cta-container">
      <div class="cta-pill">Continue Reading...</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * ZTTeam: Mẫu 2 - Parchment & Mustard Gold Accent
   * Giấy da dê vàng Sepia, chữ Montserrat đậm, trích dẫn vàng mù tạt, huy hiệu 1/Full, nút Continue Read More lớn
   */
  private ztteam_buildParchmentGoldHtml(
    storyData: { hookQuote: string; paragraphs: string[]; plainText: string },
    pageAvatarDataUri: string,
    fontSize: number,
    lineHeight: number,
    pGap: number
  ): string {
    const avatarHtml = pageAvatarDataUri
      ? `<img src="${pageAvatarDataUri}" alt="Avatar" />`
      : `<svg class="avatar-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#d4c2aa"/><circle cx="50" cy="40" r="20" fill="#755a3d"/><circle cx="50" cy="85" r="32" fill="#755a3d"/></svg>`;

    /** ZTTeam: Fluid typography tối ưu riêng cho phông Montserrat (Geometric Sans rộng) kết hợp nút lớn phía dưới */
    const wordCount = storyData.plainText.trim().split(/\s+/).length;
    let actualFontSize = 26;
    let actualLineHeight = 1.30;
    let actualPGap = 14;

    if (wordCount < 130) {
      actualFontSize = 32;
      actualLineHeight = 1.34;
      actualPGap = 18;
    } else if (wordCount < 170) {
      actualFontSize = 29;
      actualLineHeight = 1.30;
      actualPGap = 15;
    } else if (wordCount <= 215) {
      actualFontSize = 26;
      actualLineHeight = 1.28;
      actualPGap = 13;
    } else {
      actualFontSize = 23;
      actualLineHeight = 1.25;
      actualPGap = 10;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: linear-gradient(180deg, #9a7647 0%, #72532f 50%, #463118 100%);
      overflow: hidden;
      position: relative;
      font-family: 'Montserrat', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    /** CARD GIẤY DA DÊ VÀNG HỔ PHÁCH PARCHMENT */
    .content-card {
      width: 960px;
      height: 1720px;
      background: #f4ecda;
      border-radius: 40px;
      box-shadow: 0 30px 80px rgba(35, 20, 5, 0.4), 0 8px 24px rgba(35, 20, 5, 0.15);
      padding: 50px 60px 40px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      z-index: 5;
      border: 1px solid rgba(200, 180, 150, 0.5);
    }

    /** HEADER PROFILE (CHỈ AVATAR BLUR + HỘP CHE TÊN XÁM + BADGE 1/Full) */
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .avatar-wrapper {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid #c9baa8;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      flex-shrink: 0;
      position: relative;
    }
    .avatar-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(8px);
      transform: scale(1.25);
    }
    .avatar-svg {
      width: 100%;
      height: 100%;
      filter: blur(4px);
    }
    .censor-box {
      width: 280px;
      height: 32px;
      background: #7c7263;
      border-radius: 6px;
    }
    .header-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .brand-zt {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #8a6d2c;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding-left: 2px;
    }

    .badge-full {
      border: 2px solid #a67c26;
      border-radius: 9999px;
      padding: 6px 20px;
      font-size: 24px;
      font-weight: 800;
      color: #a67c26;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /** NỘI DUNG CÂU CHUYỆN (FLEX 1 DÀN ĐỀU PHỦ KÍN THẺ) */
    .story-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #141311;
      font-size: ${actualFontSize}px;
      font-weight: 800;
      line-height: ${actualLineHeight};
      letter-spacing: -0.2px;
      margin-bottom: 25px;
    }
    .story-paragraph {
      margin: 0;
    }
    .highlight-gold, .hl {
      color: #a6791e !important;
      font-weight: 900;
    }

    /** KHU VỰC BOTTOM: HOOK QUESTION + NÚT LỚN (ĐƯỢC BẢO VỆ VỊ TRÍ TUYỆT ĐỐI) */
    .bottom-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .question-hook {
      font-size: 30px;
      font-weight: 900;
      color: #141311;
      text-align: center;
    }
    .btn-read-more {
      width: 100%;
      max-width: 660px;
      background: #9e741a;
      border-radius: 9999px;
      padding: 18px 36px;
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      text-align: center;
      box-shadow: 0 10px 24px rgba(158, 116, 26, 0.40);
      letter-spacing: 0.2px;
    }
  </style>
</head>
<body>
  <div class="content-card">
    <div class="header-bar">
      <div class="header-left">
        <div class="avatar-wrapper">
          ${avatarHtml}
        </div>
        <div class="header-col">
          <div class="censor-box"></div>
          <div class="brand-zt">ZT</div>
        </div>
      </div>
      <div class="badge-full">1/Full</div>
    </div>

    <div class="story-body" id="storyBody">
      ${storyData.hookQuote ? `<p class="story-paragraph highlight-gold">${storyData.hookQuote}</p>` : ''}
      ${storyData.paragraphs.map(p => `<p class="story-paragraph">${p}</p>`).join('\n      ')}
    </div>

    <div class="bottom-section">
      <div class="question-hook">What do you think is inside?</div>
      <div class="btn-read-more">Continue Read More...</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * ZTTeam: Mẫu 3 - Botanical Sage & Frosted Glassmorphism (Xanh xô thơm tự nhiên, Thẻ kính mờ ngọc trai)
   * Nền lá cây nghệ thuật, thẻ kính mờ trắng ngọc trai, avatar làm mờ blur 8px, chữ đen than điểm nhấn xanh ngọc lục bảo đậm #047857
   */
  private ztteam_buildBotanicalSageHtml(
    storyData: { hookQuote: string; paragraphs: string[]; plainText: string },
    pageAvatarDataUri: string,
    fontSize: number,
    lineHeight: number,
    pGap: number
  ): string {
    const avatarHtml = pageAvatarDataUri
      ? `<img src="${pageAvatarDataUri}" alt="Avatar" />`
      : `<svg class="avatar-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#a3c1ad"/><circle cx="50" cy="40" r="20" fill="#2d523b"/><circle cx="50" cy="85" r="32" fill="#2d523b"/></svg>`;

    /** ZTTeam: Fluid typography tối ưu cho thẻ kính mờ ngọc trai */
    const wordCount = storyData.plainText.trim().split(/\s+/).length;
    let actualFontSize = 26;
    let actualLineHeight = 1.30;
    let actualPGap = 14;

    if (wordCount < 130) {
      actualFontSize = 32;
      actualLineHeight = 1.34;
      actualPGap = 18;
    } else if (wordCount < 170) {
      actualFontSize = 29;
      actualLineHeight = 1.30;
      actualPGap = 15;
    } else if (wordCount <= 215) {
      actualFontSize = 26;
      actualLineHeight = 1.28;
      actualPGap = 13;
    } else {
      actualFontSize = 23;
      actualLineHeight = 1.25;
      actualPGap = 10;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: linear-gradient(155deg, #a8c7b2 0%, #7da288 45%, #567e63 100%);
      overflow: hidden;
      position: relative;
      font-family: 'Montserrat', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    /** HỌA TIẾT CÀNH LÁ XANH THIÊN NHIÊN VECTOR (BOTANICAL FOLIAGE DECORATION) */
    .foliage-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 1920px;
      pointer-events: none;
      z-index: 1;
      overflow: hidden;
    }

    .foliage-svg {
      position: absolute;
      fill: none;
    }

    /** Cụm lá trên bên trái */
    .foliage-tl {
      top: -60px;
      left: -80px;
      width: 620px;
      height: 680px;
      opacity: 0.85;
      transform: rotate(-8deg);
      filter: drop-shadow(0 15px 35px rgba(20, 50, 30, 0.15));
    }

    /** Cụm lá dưới bên trái uốn lượn ôm viền thẻ */
    .foliage-bl {
      bottom: -80px;
      left: -90px;
      width: 720px;
      height: 820px;
      opacity: 0.90;
      transform: rotate(6deg);
      filter: drop-shadow(0 -15px 40px rgba(20, 50, 30, 0.18));
    }

    /** Cụm lá bên phải điểm xuyết */
    .foliage-tr {
      top: 80px;
      right: -100px;
      width: 480px;
      height: 520px;
      opacity: 0.70;
      transform: rotate(20deg);
      filter: drop-shadow(0 10px 25px rgba(20, 50, 30, 0.12));
    }

    .foliage-br {
      bottom: 60px;
      right: -80px;
      width: 440px;
      height: 480px;
      opacity: 0.65;
      transform: rotate(-15deg);
      filter: drop-shadow(0 10px 25px rgba(20, 50, 30, 0.12));
    }

    /** Ánh sáng khuếch tán tự nhiên (Soft Natural Sunbeam Glow) */
    .ambient-glow {
      position: absolute;
      top: 15%;
      left: 20%;
      width: 680px;
      height: 680px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.28) 0%, rgba(180, 225, 195, 0.12) 60%, transparent 80%);
      filter: blur(80px);
      pointer-events: none;
      z-index: 2;
    }

    /** THẺ KÍNH MỜ TRẮNG NGỌC TRAI FROSTED GLASS */
    .content-card {
      width: 960px;
      height: 1720px;
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border-radius: 46px;
      border: 2.5px solid rgba(255, 255, 255, 0.95);
      box-shadow: 0 32px 85px rgba(22, 55, 35, 0.24), 0 8px 24px rgba(22, 55, 35, 0.12);
      padding: 50px 60px 42px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      z-index: 10;
    }

    /** PROFILE HEADER (AVATAR BLUR 8PX + VỆT CHE TÊN + TÍCH XANH, BỎ URL VÀ GIỜ ĐĂNG) */
    .header-bar {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 20px;
    }
    .avatar-wrapper {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid rgba(255, 255, 255, 0.95);
      box-shadow: 0 4px 14px rgba(18, 50, 30, 0.15);
      flex-shrink: 0;
      position: relative;
    }
    .avatar-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(8px);
      transform: scale(1.25);
    }
    .avatar-svg {
      width: 100%;
      height: 100%;
      filter: blur(4px);
    }

    .name-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .brand-zt {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #2d5a3c;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding-left: 2px;
    }
    .name-badge-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .censor-box {
      width: 280px;
      height: 32px;
      background: rgba(45, 75, 55, 0.55);
      backdrop-filter: blur(8px);
      border-radius: 6px;
    }
    .verified-icon {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
    }

    /** NỘI DUNG CÂU CHUYỆN (PHỦ KÍN 90-95% THẺ, CHỮ ĐEN THAN, TỪ KHÓA XANH NGỌC LỤC BẢO SẪM) */
    .story-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #1a241e;
      font-size: ${actualFontSize}px;
      font-weight: 700;
      line-height: ${actualLineHeight};
      letter-spacing: -0.2px;
      margin-bottom: 25px;
    }
    .story-paragraph {
      margin: 0;
    }
    .highlight-emerald, .hl, strong {
      color: #047857 !important;
      font-weight: 900 !important;
    }

    /** KHU VỰC BOTTOM (DÒNG CHỮ CONTINUE READING CĂN GIỮA MÀU XANH LỤC BẢO SẪM) */
    .cta-container {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
      padding-top: 14px;
    }
    .cta-text {
      font-family: 'Montserrat', sans-serif;
      font-size: 34px;
      font-weight: 900;
      color: #047857;
      letter-spacing: -0.2px;
    }
  </style>
</head>
<body>
  <!-- Lớp trang trí cành lá thiên nhiên Sage Green -->
  <div class="foliage-layer">
    <!-- Cụm lá trên bên trái -->
    <svg class="foliage-svg foliage-tl" viewBox="0 0 600 600">
      <path d="M-40,-40 C120,80 180,240 220,420" stroke="#4a7356" stroke-width="6" stroke-linecap="round"/>
      <path d="M60,60 C120,40 180,70 190,130 C150,150 90,120 60,60 Z" fill="#93b99e" opacity="0.9"/>
      <path d="M110,130 C190,120 250,170 240,240 C180,250 130,190 110,130 Z" fill="#b1d2bc" opacity="0.85"/>
      <path d="M150,220 C240,210 310,270 290,340 C220,350 170,280 150,220 Z" fill="#7fa78b" opacity="0.95"/>
      <path d="M180,310 C270,320 330,390 310,470 C240,470 190,390 180,310 Z" fill="#a4c9b0" opacity="0.88"/>
      <path d="M40,110 C-10,160 10,240 70,250 C100,200 90,140 40,110 Z" fill="#88af94" opacity="0.85"/>
      <path d="M90,200 C30,260 60,340 130,340 C150,280 130,220 90,200 Z" fill="#bedbc6" opacity="0.8"/>
    </svg>

    <!-- Cụm lá dưới bên trái ôm viền thẻ kính mờ -->
    <svg class="foliage-svg foliage-bl" viewBox="0 0 700 800">
      <path d="M-50,750 C100,680 180,520 220,320" stroke="#3b6247" stroke-width="7" stroke-linecap="round"/>
      <path d="M50,700 C140,680 210,720 220,800 C160,820 90,780 50,700 Z" fill="#769f83" opacity="0.92"/>
      <path d="M90,620 C190,590 270,640 280,720 C200,740 130,690 90,620 Z" fill="#9dc2aa" opacity="0.9"/>
      <path d="M130,520 C230,480 320,530 320,620 C240,640 170,580 130,520 Z" fill="#badac4" opacity="0.85"/>
      <path d="M170,420 C270,390 360,450 350,530 C270,550 200,480 170,420 Z" fill="#699276" opacity="0.95"/>
      <path d="M200,320 C290,280 380,330 380,420 C300,430 230,370 200,320 Z" fill="#a8cca4" opacity="0.88"/>
      <path d="M60,560 C-10,510 -10,430 50,400 C90,440 90,520 60,560 Z" fill="#88af95" opacity="0.85"/>
      <path d="M110,460 C40,400 50,310 120,290 C150,340 150,420 110,460 Z" fill="#b5d7bf" opacity="0.8"/>
    </svg>

    <!-- Cụm lá trang trí bên phải -->
    <svg class="foliage-svg foliage-tr" viewBox="0 0 500 500">
      <path d="M480,-20 C360,80 300,200 260,340" stroke="#4a7356" stroke-width="5" stroke-linecap="round"/>
      <path d="M400,60 C330,50 280,90 280,150 C340,160 390,120 400,60 Z" fill="#9ec3ab" opacity="0.85"/>
      <path d="M350,140 C270,140 220,190 230,260 C290,260 340,210 350,140 Z" fill="#7fa68b" opacity="0.9"/>
      <path d="M300,230 C230,240 180,300 200,370 C260,360 300,300 300,230 Z" fill="#b9dac4" opacity="0.8"/>
    </svg>

    <svg class="foliage-svg foliage-br" viewBox="0 0 500 500">
      <path d="M460,460 C360,380 300,280 270,160" stroke="#426b4e" stroke-width="5" stroke-linecap="round"/>
      <path d="M390,400 C320,390 280,340 300,280 C360,280 400,330 390,400 Z" fill="#8fb59c" opacity="0.85"/>
      <path d="M340,300 C270,300 230,240 250,180 C310,180 350,240 340,300 Z" fill="#aed1b9" opacity="0.8"/>
    </svg>
  </div>

  <div class="ambient-glow"></div>

  <!-- Thẻ kính mờ trắng ngọc trai -->
  <div class="content-card">
    <div class="header-bar">
      <div class="avatar-wrapper">
        ${avatarHtml}
      </div>
      <div class="name-col">
        <div class="name-badge-row">
          <div class="censor-box"></div>
          <svg class="verified-icon" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#1877f2"/>
            <path d="M7.5 12L10.5 15L16.5 9" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="brand-zt">ZT</div>
      </div>
    </div>

    <div class="story-body" id="storyBody">
      ${storyData.hookQuote ? `<p class="story-paragraph highlight-emerald">${storyData.hookQuote}</p>` : ''}
      ${storyData.paragraphs.map(p => `<p class="story-paragraph">${p}</p>`).join('\n      ')}
    </div>

    <div class="cta-container">
      <div class="cta-text">Continue Reading...</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * ZTTeam: Mẫu cũ - Frosted Glass Card (Kính mờ hiện đại & Aurora Glow)
   */
  private ztteam_buildFrostedGlassHtml(
    storyData: { hookQuote: string; paragraphs: string[]; plainText: string },
    pageAvatarDataUri: string,
    theme: any,
    pageName: string,
    hookFontSize: number,
    fontSize: number,
    lineHeight: number,
    pGap: number
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700&family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: #010a0e;
      overflow: hidden;
      position: relative;
      font-family: 'Barlow Condensed', sans-serif;
    }

    .bg-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 1920px;
      background: ${theme.bgGradient};
      z-index: 1;
    }

    .aura-1 {
      position: absolute;
      width: 820px;
      height: 820px;
      border-radius: 50%;
      background: ${theme.aura1};
      filter: blur(140px);
      top: 80px;
      left: -200px;
      opacity: 0.65;
      z-index: 2;
    }

    .aura-2 {
      position: absolute;
      width: 880px;
      height: 880px;
      border-radius: 50%;
      background: ${theme.aura2};
      filter: blur(150px);
      bottom: 250px;
      right: -240px;
      opacity: 0.65;
      z-index: 2;
    }

    .aura-3 {
      position: absolute;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: ${theme.accentGlow};
      filter: blur(110px);
      top: 45%;
      left: 25%;
      opacity: 0.35;
      z-index: 2;
    }

    .noise-grid {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 1920px;
      background:
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 32px 32px;
      z-index: 3;
      pointer-events: none;
    }

    .external-header {
      position: absolute;
      top: 68px;
      left: 60px;
      width: 960px;
      display: flex;
      align-items: center;
      gap: 16px;
      z-index: 10;
    }

    .avatar-wrapper {
      position: relative;
      width: 72px;
      height: 72px;
      flex-shrink: 0;
    }

    .page-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid ${theme.hookColor};
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65);
      object-fit: cover;
    }

    .avatar-fallback {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid ${theme.hookColor};
      background: linear-gradient(135deg, #0e3e4b 0%, #061622 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
    }

    .header-meta {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .page-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .page-name-blurred {
      font-family: 'Montserrat', sans-serif;
      font-size: 27px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
      line-height: 1.15;
      filter: blur(5px);
      user-select: none;
    }

    .verified-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .post-submeta {
      font-family: 'Montserrat', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: #e2e8f0;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    }

    .glass-card-wrapper {
      position: absolute;
      top: 155px;
      left: 60px;
      width: 960px;
      height: 1575px;
      z-index: 10;
    }

    .glass-card {
      width: 100%;
      height: 100%;
      background: ${theme.cardBg};
      backdrop-filter: blur(36px);
      -webkit-backdrop-filter: blur(36px);
      border-radius: 36px;
      border: ${theme.cardBorder};
      box-shadow: ${theme.cardGlow}, inset 0 1px 2px rgba(255, 255, 255, 0.18);
      padding: 40px 46px 34px 46px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card-top-content {
      display: flex;
      flex-direction: column;
    }

    .story-hook {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: ${hookFontSize}px;
      font-weight: 700;
      color: ${theme.hookColor};
      line-height: 1.20;
      margin-bottom: 20px;
      letter-spacing: -0.2px;
      text-shadow: 0 0 16px rgba(245, 158, 11, 0.4);
    }

    .story-body {
      display: flex;
      flex-direction: column;
      gap: ${pGap}px;
    }

    .story-p {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: ${lineHeight};
      color: ${theme.textColor};
      letter-spacing: -0.15px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.75);
    }

    .hl {
      color: ${theme.hlColor} !important;
      font-weight: 700;
      text-shadow: 0 0 12px rgba(245, 158, 11, 0.45);
    }

    .cta-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      width: 100%;
      padding-top: 12px;
    }

    .cta-text {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 37px;
      font-weight: 700;
      color: ${theme.ctaColor};
      text-shadow: 0 0 18px rgba(56, 189, 248, 0.7);
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  <div class="bg-canvas"></div>
  <div class="aura-1"></div>
  <div class="aura-2"></div>
  <div class="aura-3"></div>
  <div class="noise-grid"></div>

  <div class="external-header">
    <div class="avatar-wrapper">
      ${pageAvatarDataUri 
        ? `<img src="${pageAvatarDataUri}" class="page-avatar" />`
        : `<div class="avatar-fallback">${pageName.substring(0, 2).toUpperCase()}</div>`
      }
    </div>
    <div class="header-meta">
      <div class="page-name-row">
        <span class="page-name-blurred">${pageName}</span>
        <svg class="verified-icon" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="${theme.verifiedColor}"/>
          <path d="M7.5 12L10.5 15L16.5 9" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="post-submeta">ZT</span>
    </div>
  </div>

  <div class="glass-card-wrapper">
    <div class="glass-card">
      <div class="card-top-content">
        <div class="story-hook">${storyData.hookQuote}</div>
        <div class="story-body" id="storyBody">
          ${storyData.paragraphs.map(p => `<p class="story-p">${p}</p>`).join('\n          ')}
        </div>
      </div>
      <div class="cta-row">
        <div class="cta-text">Continue Reading...</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}

