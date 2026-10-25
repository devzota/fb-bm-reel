import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFacebookService } from '../facebook/facebook.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { ztteam_getReelsPath, ztteam_getImagesPath, ztteam_getStorageRoot } from '../common/ztteam_storage.util';
import { TelegramService, ztteam_extractErrorMessage } from '../telegram/telegram.service';

/**
 * ZTTeam: Kho Mồi Kích Hoạt Đa Dạng (Dynamic Viral Hook Comments)
 * Luân phiên và ngẫu nhiên các mẫu câu kích thích tò mò và kêu gọi để lại comment
 * Giúp tối ưu tương tác tự nhiên và tuyệt đối chống Facebook quét trùng lặp spam.
 */
export function ztteam_getRandomHookComment(seed?: string): string {
  const HOOK_TEMPLATES = [
    `...I know you're all very curious about what happens next, so if you want to read on, leave "YES" in the comments below! 👇`,
    `...Want to know the full truth of what happened next? Drop a "YES" or "NEXT" below! 👇🔥`,
    `...The next part will leave you completely speechless! Leave "YES" in the comments if you want me to share it right away! 👇✨`,
    `...Curious about the unexpected twist? Comment "YES" down below to continue reading! 👇👀`,
    `...If you're eager to see how this story ends, let me know by leaving a "YES" in the comments! 👇❤️`,
    `...Things took a crazy turn right after this! Drop "YES" below and I'll post the continuation! 👇💬`,
    `...Can you guess what happened next? Leave "YES" in the comments if you want the next part! 👇👇`,
    `...The ending completely shocked everyone! Comment "YES" or "MORE" below if you want the full story! 👇⚡`,
    `...Are you ready for the shocking revelation? Leave "YES" down below to find out! 👇😲`,
    `...You won't believe what they discovered next! Comment "YES" below and I'll send you the rest! 👇🙏`,
    `...Want to know how this ends? Drop a quick "YES" below and I'll unlock Part 2 for you! 👇💫`,
    `...I was blown away when I read the ending! Leave "YES" below if you want the conclusion! 👇📖`
  ];

  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % HOOK_TEMPLATES.length;
    return HOOK_TEMPLATES[index];
  }

  const randomIndex = Math.floor(Math.random() * HOOK_TEMPLATES.length);
  return HOOK_TEMPLATES[randomIndex];
}

@Injectable()
export class ZTTeamPublisherCron {
  private readonly logger = new Logger(ZTTeamPublisherCron.name);
  private isRunning = false;
  /** ZTTeam: Lưu vết thời điểm xuất bản gần nhất trên toàn hệ thống (mọi Page) để chống Burst API */
  private ztteam_lastGlobalPublishTimestamp = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookService: ZTTeamFacebookService,
    private readonly eventEmitter: EventEmitter2,
    private readonly telegramService: TelegramService,
  ) { }

  @Cron(CronExpression.EVERY_MINUTE)
  async ztteam_handleCron() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Publisher cron is already running, skipping this tick');
      return;
    }
    this.isRunning = true;

    try {
      /** 0. Xử lý quy trình tự động đăng bình luận nối tiếp (Part 2) sau 2 tiếng cho các bài đã đăng */
      await this.ztteam_handleDelayedComments();

      /** 1. Tìm các Reel đã render xong đang chờ đăng (xếp theo thời gian tạo cũ nhất trước) */
      const pendingReels = await this.prisma.ztteam_reels.findMany({
        where: {
          status: 'COMPLETED',
          is_posted: false,
          source_type: { not: 'TIKTOK_CLONE' }
        },
        include: { page: { include: { fb_account: true } } },
        orderBy: { created_at: 'asc' },
      });

      /** 2. Tìm các Ảnh đã tạo xong đang chờ đăng (xếp theo thời gian tạo cũ nhất trước) */
      const pendingImages = await this.prisma.ztteam_images.findMany({
        where: {
          status: 'COMPLETED',
          is_posted: false,
        },
        include: { page: { include: { fb_account: true } } },
        orderBy: { created_at: 'asc' },
      });

      if (pendingReels.length === 0 && pendingImages.length === 0) {
        return;
      }

      /** 3. Tập hợp danh sách các Page có bài chờ đăng */
      const pagesMap = new Map<string, any>();
      for (const reel of pendingReels) {
        if (reel.page && !pagesMap.has(reel.page_id)) {
          pagesMap.set(reel.page_id, reel.page);
        }
      }
      for (const img of pendingImages) {
        if (img.page && img.page_id && !pagesMap.has(img.page_id)) {
          pagesMap.set(img.page_id, img.page);
        }
      }

      const now = new Date();

      /** 4. Duyệt các Page để lọc ra danh sách bài viết ứng viên đủ điều kiện xuất bản */
      const eligibleCandidates: Array<{
        page: any;
        selectedItem: { type: 'reel_legacy' | 'image_reel' | 'image_only'; data: any };
        diffMinutesFromLastPost: number;
        itemCreatedAt: number;
      }> = [];

      for (const [pageId, page] of pagesMap.entries()) {
        const { auto_publish_enabled, schedule_mode, schedule_fixed_times, schedule_immediate_gap_minutes, post_format } = page;

        /** Nếu Page đang tắt tự động đăng bài hoặc bị vô hiệu hóa thì bỏ qua */
        if (auto_publish_enabled === false || page.is_active === false) {
          continue;
        }

        /** Lấy bài đăng gần nhất (thành công HOẶC thất bại) của Page này để tính khoảng cách thời gian */
        const lastPostedReel = await this.prisma.ztteam_reels.findFirst({
          where: {
            page_id: pageId,
            OR: [{ is_posted: true }, { status: 'FAILED' }]
          },
          orderBy: { updated_at: 'desc' }
        });
        const lastPostedImage = await this.prisma.ztteam_images.findFirst({
          where: {
            page_id: pageId,
            OR: [{ is_posted: true }, { status: 'FAILED' }]
          },
          orderBy: { updated_at: 'desc' }
        });

        let lastPostTime: Date | null = null;
        let lastPostType: 'reel' | 'image' | null = null;

        if (lastPostedReel) {
          /** Dùng updated_at thay vì posted_at vì có thể nó là FAILED */
          lastPostTime = new Date(lastPostedReel.updated_at);
          lastPostType = 'reel';
        }
        if (lastPostedImage) {
          const imageTime = new Date(lastPostedImage.updated_at);
          if (!lastPostTime || imageTime > lastPostTime) {
            lastPostTime = imageTime;
            lastPostType = 'image';
          }
        }

        const diffMinutesFromLastPost = lastPostTime ? Math.floor((now.getTime() - lastPostTime.getTime()) / 60000) : Infinity;

        let shouldPublish = false;

        if (schedule_mode === 'fixed') {
          if (schedule_fixed_times && Array.isArray(schedule_fixed_times) && schedule_fixed_times.length > 0) {
            /** Luôn tính giờ và phút theo múi giờ chuẩn Việt Nam (Asia/Ho_Chi_Minh) */
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'Asia/Ho_Chi_Minh',
              hour: 'numeric',
              minute: 'numeric',
              hour12: false,
            });
            const parts = vnFormatter.formatToParts(now);
            const vnH = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
            const vnM = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
            const currentMinutes = vnH * 60 + vnM;

            for (const time of schedule_fixed_times as string[]) {
              const [h, m] = time.split(':').map(Number);
              const fixedTimeMinutes = h * 60 + m;

              /** ZTTeam: Mở rộng khung giờ từ 5 phút lên 45 phút để các Page xếp hàng tuần tự không bị lỡ lượt */
              if (currentMinutes >= fixedTimeMinutes && currentMinutes < fixedTimeMinutes + 45) {
                /** Nếu đã đăng cách đây chưa đầy 45 phút -> Khung giờ này đã được xử lý */
                if (diffMinutesFromLastPost < 45) {
                  this.logger.log(`Page ${page.name}: Slot ${time} already served (${diffMinutesFromLastPost}m ago). Skipping.`);
                  break;
                }
                shouldPublish = true;
                break;
              }
            }
          }
        } else {
          /** immediate / gap mode */
          const gapMinutes = schedule_immediate_gap_minutes || 60;
          if (!lastPostTime || diffMinutesFromLastPost >= gapMinutes) {
            shouldPublish = true;
          } else {
            this.logger.log(`Page ${page.name}: Waiting for gap (${diffMinutesFromLastPost}/${gapMinutes}m).`);
          }
        }

        if (!shouldPublish) {
          continue;
        }

        /** 5. Phân loại bài đăng Video Reel và Ảnh cho Page này */
        const pageReelsOld = pendingReels.filter(r => r.page_id === pageId);
        const pageImagesWithVideo = pendingImages.filter(i => i.page_id === pageId && i.video_url);
        const pageImagesOnly = pendingImages.filter(i => i.page_id === pageId && !i.video_url);

        /** Tập hợp tất cả các ứng viên Reel */
        const allAvailableReels = [
          ...pageReelsOld.map(r => ({ type: 'reel_legacy' as const, data: r })),
          ...pageImagesWithVideo.map(i => ({ type: 'image_reel' as const, data: i })),
        ];

        /** Tập hợp tất cả các ứng viên Ảnh */
        const allAvailableImages = pageImagesOnly.map(i => ({ type: 'image_only' as const, data: i }));

        let selectedItem: { type: 'reel_legacy' | 'image_reel' | 'image_only'; data: any } | null = null;

        if (post_format === 'reel') {
          /** Cấu hình: Nếu chọn reel thì đăng reel, nếu bài chuẩn bị đăng ko có reel thì đăng ảnh (đảm bảo phải có bài để đăng) */
          if (allAvailableReels.length > 0) {
            selectedItem = allAvailableReels[0];
          } else if (allAvailableImages.length > 0) {
            selectedItem = allAvailableImages[0];
          } else if (pageImagesWithVideo.length > 0) {
            selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
          }
        } else if (post_format === 'image') {
          /** Cấu hình: Nếu chọn ảnh thì chắc chắn phải đăng ảnh */
          if (allAvailableImages.length > 0) {
            selectedItem = allAvailableImages[0];
          } else if (pageImagesWithVideo.length > 0) {
            selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
          }
        } else {
          /** Cấu hình: Nếu chọn ảnh và reel xen kẽ thì đăng đúng chuẩn, trường hợp reel ko có vẫn đăng ảnh */
          if (lastPostType === 'reel') {
            /** Lượt trước đăng Reel -> Lượt này đăng Ảnh */
            if (allAvailableImages.length > 0) {
              selectedItem = allAvailableImages[0];
            } else if (pageImagesWithVideo.length > 0) {
              selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
            }
          } else {
            /** Lượt trước đăng Ảnh -> Lượt này đăng Reel. Trường hợp reel ko có vẫn đăng ảnh */
            if (allAvailableReels.length > 0) {
              selectedItem = allAvailableReels[0];
            } else if (allAvailableImages.length > 0) {
              selectedItem = allAvailableImages[0];
            } else if (pageImagesWithVideo.length > 0) {
              selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
            }
          }
        }

        if (selectedItem) {
          const itemDate = selectedItem.data.created_at || selectedItem.data.updated_at || now;
          eligibleCandidates.push({
            page,
            selectedItem,
            diffMinutesFromLastPost,
            itemCreatedAt: new Date(itemDate).getTime(),
          });
        } else {
          this.logger.log(`Page ${page.name}: Không có bài viết đáp ứng điều kiện theo cấu hình "${post_format}" -> Bỏ qua, không gọi API đăng Facebook.`);
        }
      }

      if (eligibleCandidates.length === 0) {
        return;
      }

      /**
       * ZTTeam: Thuật toán điều phối hàng đợi (Priority Dispatcher):
       * 1. Ưu tiên Page nào lâu nhất chưa có bài đăng (diffMinutesFromLastPost giảm dần)
       * 2. Nếu bằng nhau, ưu tiên bài viết được tạo sớm nhất (itemCreatedAt tăng dần)
       */
      eligibleCandidates.sort((a, b) => {
        if (b.diffMinutesFromLastPost !== a.diffMinutesFromLastPost) {
          return b.diffMinutesFromLastPost - a.diffMinutesFromLastPost;
        }
        return a.itemCreatedAt - b.itemCreatedAt;
      });

      this.logger.log(`[ZTTeam Global Dispatcher] Có ${eligibleCandidates.length} bài sẵn sàng xuất bản. Đang điều phối bài ưu tiên cao nhất...`);

      /**
       * ZTTeam: Kiểm tra và đảm bảo khoảng cách an toàn toàn cục (Global Rate Limiter):
       * Tuyệt đối không gọi Facebook API nếu lần đăng gần nhất trên toàn hệ thống chưa đủ 45 giây.
       */
      const elapsedSinceLastGlobal = Date.now() - this.ztteam_lastGlobalPublishTimestamp;
      const MIN_GLOBAL_GAP_MS = 45000;
      if (this.ztteam_lastGlobalPublishTimestamp > 0 && elapsedSinceLastGlobal < MIN_GLOBAL_GAP_MS) {
        const waitMs = MIN_GLOBAL_GAP_MS - elapsedSinceLastGlobal;
        this.logger.log(`[ZTTeam Global Dispatcher] Giãn cách bảo vệ Meta: Chờ thêm ${Math.round(waitMs / 1000)}s trước khi gọi Facebook API...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      /** Lấy bài viết ưu tiên số 1 để đăng trong chu kỳ này */
      const target = eligibleCandidates[0];
      const { selectedItem, page } = target;

      this.logger.log(`[ZTTeam Global Dispatcher] Đang xuất bản cho Page: ${page.name} (Đã chờ: ${target.diffMinutesFromLastPost === Infinity ? 'Mới/Vô cực' : target.diffMinutesFromLastPost + 'm'})`);

      if (selectedItem.type === 'reel_legacy') {
        await this.ztteam_publishReel(selectedItem.data, page);
      } else if (selectedItem.type === 'image_only') {
        await this.ztteam_publishImage(selectedItem.data, page, true);
      } else {
        await this.ztteam_publishImage(selectedItem.data, page, false);
      }

      this.ztteam_lastGlobalPublishTimestamp = Date.now();
    } catch (error: any) {
      this.logger.error(`Unified publisher cron error: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Đăng video Reel lên Facebook Page
   */
  private async ztteam_publishReel(reel: any, page: any) {
    this.logger.log(`Auto-publishing reel ${reel.id} to page ${page.name}...`);

    try {
      const videoPath = ztteam_getReelsPath(reel.id, 'output.mp4');

      if (!fs.existsSync(videoPath)) {
        throw new Error('File video không tồn tại trên server');
      }

      let description = reel.ai_caption || reel.wp_post_title || '';

      /** Xóa tracking link cũ nếu có */
      if (description.includes('utm_source=reel')) {
        const parts = description.split(/(👉|🔥|📌|👇|🔗|Read more:)/);
        if (parts.length > 1) {
          description = parts[0].trim();
        } else {
          description = description.split(/\n\n.*utm_source=reel/)[0].trim();
        }
      }

      const slugify = (text: string) => {
        if (!text) return '';
        return text.toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
      };

      const utmMedium = slugify(page?.fb_account?.name || 'account');
      const utmCampaign = slugify(page?.name || 'page');
      const trackingLink = reel.wp_post_url ? `${reel.wp_post_url}${reel.wp_post_url.includes('?') ? '&' : '?'}utm_source=reel&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}` : '';

      if (page.add_link_to_caption && reel.wp_post_url) {
        const prefixes = [
          '👉 Discover more here:',
          '🔥 Read the full story:',
          '📌 Check out the details:',
          '👇 Full article link:',
          '🔗 Learn more at:'
        ];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        description = `${prefix} ${trackingLink}\n\n${description}`;
      }

      const response = await this.facebookService.ztteam_publishReel(
        page.fb_page_id,
        videoPath,
        description
      );

      /**
       * ZTTeam: Tuân thủ quy tắc bảo vệ phân phối tự nhiên (Organic Reach):
       * Tuyệt đối không đăng comment chứa link ngay lập tức khi vừa xuất bản bài viết.
       * Comment kèm link chỉ được phép xuất hiện sau 10 tiếng.
       */


      await this.prisma.ztteam_reels.update({
        where: { id: reel.id },
        data: {
          status: 'POSTED',
          is_posted: true,
          posted_at: new Date(),
          fb_post_id: response.id,
          post_retry_count: 0,
        }
      });

      this.eventEmitter.emit('reel.updated', { id: reel.id, status: 'POSTED', fb_post_id: response.id });
      this.logger.log(`Reel ${reel.id} successfully auto-published to page ${page.name}`);
    } catch (error: any) {
      const extractedError = ztteam_extractErrorMessage(error);
      const isIdentityCheckpoint =
        extractedError.includes('4854002') ||
        extractedError.includes('xác nhận danh tính') ||
        extractedError.includes('confirm your identity');

      let currentRetries = (reel.post_retry_count || 0) + 1;
      this.logger.error(`Failed to auto-publish reel ${reel.id} (Attempt ${currentRetries}/3): ${extractedError}`);

      if (isIdentityCheckpoint) {
        /**
         * ZTTeam: Kích hoạt Circuit Breaker ngay lập tức!
         * Meta yêu cầu xác nhận danh tính trên điện thoại.
         * Dừng thử lại ngay (set 3) và tạm dừng auto_publish trên Page để bảo vệ BM và các Page khác.
         */
        currentRetries = 3;
        await this.prisma.ztteam_pages.update({
          where: { id: page.id },
          data: {
            auto_publish_enabled: false,
            token_status: 'checkpoint_required'
          }
        }).catch(() => {});
        this.logger.warn(`[CIRCUIT BREAKER] Page ${page.name} kích hoạt bảo vệ do Facebook yêu cầu xác nhận danh tính. Tạm ngưng auto-publish.`);
      }

      if (currentRetries < 3) {
        await this.prisma.ztteam_reels.update({
          where: { id: reel.id },
          data: {
            post_retry_count: currentRetries,
            error_log: `Lần thử ${currentRetries}/3 thất bại: ${extractedError}`,
          }
        });
        this.logger.log(`Reel ${reel.id} kept in COMPLETED status for next time slot retry (Attempt ${currentRetries}/3)`);
      } else {
        await this.prisma.ztteam_reels.update({
          where: { id: reel.id },
          data: {
            status: 'FAILED',
            post_retry_count: currentRetries,
            error_log: isIdentityCheckpoint
              ? `[CIRCUIT BREAKER] Facebook yêu cầu Quản trị viên mở điện thoại xác minh danh tính (Subcode 4854002): ${extractedError}`
              : `Lỗi đăng bài sau 3 lần thử: ${extractedError}`,
          }
        });

        let ownerEmail = 'N/A';
        if (page?.fb_account?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({ where: { id: page.fb_account.owner_user_id }, select: { email: true } });
          if (u) ownerEmail = u.email;
        }

        const alertMsg = this.telegramService.ztteam_formatAlert({
          systemName: isIdentityCheckpoint ? 'Xác Minh Danh Tính Fanpage' : 'Xuất Bản Fanpage (Đăng Video Reel)',
          fanpageName: page.name || 'Không rõ',
          postTitle: reel.wp_post_title || 'Video Reel',
          step: 'Đăng tải video Reel lên Facebook qua Graph API',
          rawError: extractedError,
          nextAction: isIdentityCheckpoint
            ? 'Hệ thống đã tự động tạm ngắt xuất bản trên Page này để bảo vệ BM. Vui lòng mở ứng dụng Facebook trên điện thoại -> Chuyển sang Page -> Đăng thử 1 bài viết để xác nhận danh tính, sau đó bật lại tự động đăng trên web.'
            : 'Đã thử lại 3 lần thất bại. Vui lòng kiểm tra lại token Fanpage hoặc quyền đăng bài.',
          memberEmail: ownerEmail,
        });
        this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
      }
    }
  }

  /**
   * Đăng bài ảnh lên Facebook Page
   */
  private async ztteam_publishImage(image: any, page: any, forceImageOnly = false) {
    this.logger.log(`Auto-publishing image ${image.id} to page ${page.name} (forceImageOnly: ${forceImageOnly})...`);

    try {
      let absoluteImagePath = ztteam_getImagesPath(image.id, 'output.png');

      /** Fallback to image.image_url if output.png is not in standard dir */
      if (!fs.existsSync(absoluteImagePath) && image.image_url) {
        let fallback: string;
        if (image.image_url.startsWith('/storage') || image.image_url.startsWith('storage')) {
          fallback = path.join(ztteam_getStorageRoot(), image.image_url.replace(/^\/?storage[/\\]?/, ''));
        } else if (fs.existsSync(image.image_url)) {
          fallback = image.image_url;
        } else {
          fallback = path.join(ztteam_getStorageRoot(), image.image_url.replace(/^[/\\]+/, ''));
        }
        if (fs.existsSync(fallback)) {
          absoluteImagePath = fallback;
        }
      }

      if (!fs.existsSync(absoluteImagePath)) {
        this.logger.warn(`File ảnh không tồn tại trên server: ${absoluteImagePath}`);
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            status: 'FAILED',
            error_log: 'File ảnh không tồn tại trên máy chủ (được tạo từ môi trường khác hoặc đã bị xóa)',
          }
        });
        return;
      }

      let caption = image.ai_caption || image.wp_post_title || '';

      const slugify = (text: string) => {
        if (!text) return '';
        return text.toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
      };

      const utmMedium = slugify(page?.fb_account?.name || 'account');
      const utmCampaign = slugify(page?.name || 'page');
      const trackingLink = image.wp_post_url ? `${image.wp_post_url}${image.wp_post_url.includes('?') ? '&' : '?'}utm_source=image&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}` : '';

      if (page.add_link_to_caption && image.wp_post_url) {
        const prefixes = [
          '👉 Discover more here:',
          '🔥 Read the full story:',
          '📌 Check out the details:',
          '👇 Full article link:',
          '🔗 Learn more at:'
        ];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        caption = `${prefix} ${trackingLink}\n\n${caption}`;
      }

      let fbPostId: string;
      /** ZTTeam: Nếu bài viết đã tạo Video Reel và không bắt buộc chỉ đăng ảnh, ưu tiên xuất bản Reel/Video lên Facebook */
      if (image.video_url && !forceImageOnly) {
        let absoluteVideoPath = '';
        if (image.video_url.startsWith('/storage/')) {
          absoluteVideoPath = path.join(ztteam_getStorageRoot(), image.video_url.replace(/^\/storage\//, ''));
        } else {
          absoluteVideoPath = path.join(ztteam_getStorageRoot(), image.video_url.replace(/^[/\\]+/, ''));
        }

        if (fs.existsSync(absoluteVideoPath)) {
          const response = await this.facebookService.ztteam_publishReel(
            page.fb_page_id,
            absoluteVideoPath,
            caption
          );
          fbPostId = response.id;
        } else {
          fbPostId = await this.facebookService.ztteam_publishPhoto(
            page.fb_page_id,
            absoluteImagePath,
            caption
          );
        }
      } else {
        fbPostId = await this.facebookService.ztteam_publishPhoto(
          page.fb_page_id,
          absoluteImagePath,
          caption
        );
      }

      await this.prisma.ztteam_images.update({
        where: { id: image.id },
        data: {
          is_posted: true,
          posted_at: new Date(),
          fb_post_id: fbPostId,
          status: 'POSTED',
          comment_step: 0,
          post_retry_count: 0,
        }
      });

      this.logger.log(`Successfully published image ${image.id} to page ${page.name}, Post ID: ${fbPostId} (Comment Step 0 scheduled)`);
      this.eventEmitter.emit('image.posted', { imageId: image.id, pageId: page.id });
    } catch (error: any) {
      const extractedError = ztteam_extractErrorMessage(error);
      const isIdentityCheckpoint =
        extractedError.includes('4854002') ||
        extractedError.includes('xác nhận danh tính') ||
        extractedError.includes('confirm your identity');

      let currentRetries = (image.post_retry_count || 0) + 1;
      this.logger.error(`Failed to auto-publish image ${image.id} (Attempt ${currentRetries}/3): ${extractedError}`);

      if (isIdentityCheckpoint) {
        /**
         * ZTTeam: Kích hoạt Circuit Breaker ngay lập tức!
         * Meta yêu cầu xác nhận danh tính trên điện thoại.
         * Dừng thử lại ngay (set 3) và tạm dừng auto_publish trên Page để bảo vệ BM và các Page khác.
         */
        currentRetries = 3;
        await this.prisma.ztteam_pages.update({
          where: { id: page.id },
          data: {
            auto_publish_enabled: false,
            token_status: 'checkpoint_required'
          }
        }).catch(() => {});
        this.logger.warn(`[CIRCUIT BREAKER] Page ${page.name} kích hoạt bảo vệ do Facebook yêu cầu xác nhận danh tính. Tạm ngưng auto-publish.`);
      }

      if (currentRetries < 3) {
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            post_retry_count: currentRetries,
            error_log: `Lần thử ${currentRetries}/3 thất bại: ${extractedError}`
          }
        });
        this.logger.log(`Image ${image.id} kept in COMPLETED status for next time slot retry (Attempt ${currentRetries}/3)`);
      } else {
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            status: 'FAILED',
            post_retry_count: currentRetries,
            error_log: isIdentityCheckpoint
              ? `[CIRCUIT BREAKER] Facebook yêu cầu Quản trị viên mở điện thoại xác minh danh tính (Subcode 4854002): ${extractedError}`
              : `Lỗi đăng ảnh sau 3 lần thử: ${extractedError}`
          }
        });

        let ownerEmail = 'N/A';
        if (page?.fb_account?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({ where: { id: page.fb_account.owner_user_id }, select: { email: true } });
          if (u) ownerEmail = u.email;
        }

        const alertMsg = this.telegramService.ztteam_formatAlert({
          systemName: isIdentityCheckpoint ? 'Xác Minh Danh Tính Fanpage' : 'Xuất Bản Fanpage (Đăng Ảnh 2K)',
          fanpageName: page.name || 'Không rõ',
          postTitle: image.wp_post_title || 'Bài viết ảnh',
          step: 'Đăng tải ảnh 2K và nội dung Caption lên Fanpage Facebook',
          rawError: extractedError,
          nextAction: isIdentityCheckpoint
            ? 'Hệ thống đã tự động tạm ngắt xuất bản trên Page này để bảo vệ BM. Vui lòng mở ứng dụng Facebook trên điện thoại -> Chuyển sang Page -> Đăng thử 1 bài viết để xác nhận danh tính, sau đó bật lại tự động đăng trên web.'
            : 'Đã thử lại 3 lần thất bại. Vui lòng kiểm tra lại token Fanpage hoặc kết nối mạng.',
          memberEmail: ownerEmail,
        });
        this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
      }
    }
  }

  /**
   * Helper slugify chuỗi văn bản cho tracking link
   */
  private ztteam_slugify(text: string): string {
    if (!text) return '';
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
  }

  /**
   * ZTTeam: Quy trình tự động đăng bình luận đoạn nối tiếp (Part 2) sau 2 tiếng:
   * - Sau đúng 2 tiếng (120 phút) kể từ khi bài viết được xuất bản lên Facebook:
   * - Hệ thống tự động lấy nội dung Part 2 (đoạn nối tiếp câu chuyện) từ img.ai_first_comment.
   * - Đăng 1 bình luận duy nhất dưới bài viết: 100% văn bản thuần túy, TUYỆT ĐỐI KHÔNG CÓ LINK WEBSITE.
   * - Không còn bình luận mồi "YES", không còn link ra ngoài, tối ưu 100% Organic Reach tự nhiên.
   */
  async ztteam_handleDelayedComments() {
    try {
      const now = new Date();

      /** Quét các bài viết đã đăng tối thiểu 2 tiếng trước nhưng chưa đăng bình luận Part 2 (comment_step = 0) */
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const pendingImages = await this.prisma.ztteam_images.findMany({
        where: {
          is_posted: true,
          fb_post_id: { not: null },
          comment_step: 0,
          posted_at: { gte: threeDaysAgo, lte: twoHoursAgo }, /** BẮT BUỘC ĐÃ ĐỦ 2 TIẾNG */
        },
        include: {
          page: {
            include: { fb_account: true }
          }
        },
        take: 10
      });

      for (const img of pendingImages) {
        if (!img.page?.fb_page_id || !img.fb_post_id) continue;

        /** Kiểm tra giãn cách thời gian an toàn nếu từng thử thất bại trước đó */
        if (img.post_retry_count > 0) {
          const elapsedMs = now.getTime() - new Date(img.updated_at).getTime();
          const requiredWaitMs = img.post_retry_count === 1 ? 5 * 60 * 1000 : 10 * 60 * 1000;
          if (elapsedMs < requiredWaitMs) {
            continue;
          }
        }

        try {
          /** Chuẩn bị nội dung bình luận Part 2 nối tiếp */
          let part2Text = img.ai_first_comment || '';

          /** Làm sạch triệt để: Gỡ bỏ mọi câu CTA hoặc URL cũ nếu có trong database */
          part2Text = part2Text
            .replace(/👉\s*FULL STORY.*$/is, '')
            .replace(/https?:\/\/[^\s]+/gi, '')
            .trim();

          /** Nếu bài viết không có part 2 (quá ngắn), đánh dấu hoàn tất để không comment bậy bạ */
          if (!part2Text || part2Text.length < 20) {
            this.logger.log(`[Auto-Comment Part 2] Image ${img.id} has no valid continuation text. Marking complete.`);
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: { comment_step: 2, post_retry_count: 0 }
            });
            continue;
          }

          /** Đăng bình luận Part 2 trực tiếp dưới bài đăng Facebook */
          await this.facebookService.ztteam_publishComment(
            img.page.fb_page_id,
            img.fb_post_id,
            part2Text
          );

          await this.prisma.ztteam_images.update({
            where: { id: img.id },
            data: {
              comment_step: 2, /** Hoàn tất quy trình bình luận */
              post_retry_count: 0,
            }
          });

          this.logger.log(`[Auto-Comment Part 2 - 2h] Successfully posted continuation comment for image ${img.id} on page ${img.page.name} (Post: ${img.fb_post_id})`);
        } catch (err: any) {
          const extractedError = ztteam_extractErrorMessage(err);
          const currentRetries = (img.post_retry_count || 0) + 1;
          this.logger.error(`[Auto-Comment Part 2] Failed for image ${img.id} (Attempt ${currentRetries}/3): ${extractedError}`);

          if (currentRetries < 3) {
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                post_retry_count: currentRetries,
                error_log: `Lần thử đăng Part 2 ${currentRetries}/3 thất bại: ${extractedError}`,
              }
            }).catch(() => { });
            this.logger.log(`[Auto-Comment Part 2] Image ${img.id} scheduled for safe backoff retry ${currentRetries + 1}/3 after ${currentRetries === 1 ? '5' : '10'} minutes.`);
          } else {
            /** Sau 3 lần thử thất bại mới kết thúc và báo Telegram */
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                comment_step: 2,
                post_retry_count: currentRetries,
                error_log: `Lỗi đăng Part 2 sau 3 lần thử (giãn cách 5-10 phút): ${extractedError}`,
              }
            }).catch(() => { });

            let ownerEmail = 'N/A';
            if (img.page?.fb_account?.owner_user_id) {
              const u = await this.prisma.ztteam_users.findUnique({ where: { id: img.page.fb_account.owner_user_id }, select: { email: true } });
              if (u) ownerEmail = u.email;
            }

            const alertMsg = this.telegramService.ztteam_formatAlert({
              systemName: 'Tự Động Bình Luận (Auto-Comment)',
              fanpageName: img.page?.name || 'Không rõ',
              postTitle: img.wp_post_title || 'Bài viết ảnh 2K',
              step: 'Đăng bình luận đoạn nối tiếp (Part 2) sau 2 tiếng',
              rawError: extractedError,
              nextAction: 'Đã thử lại 3 lần (giãn cách an toàn 5-10 phút) đều thất bại. Hệ thống đã kết thúc quy trình.',
              memberEmail: ownerEmail,
            });
            this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in ztteam_handleDelayedComments: ${error.message}`);
    }
  }
}
