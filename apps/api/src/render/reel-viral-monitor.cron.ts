import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFacebookService } from '../facebook/facebook.service';
import { TelegramService } from '../telegram/telegram.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * ZTTeam: Danh sách các mẫu câu bình luận dẫn link tự nhiên, hấp dẫn
 * Tuyệt đối không gắn tracking UTM theo đúng yêu cầu cấu hình sạch của hệ thống
 */
export const ZTTEAM_VIRAL_COMMENT_TEMPLATES = [
  (url: string) => `👉 Read the full story here: ${url}`,
  (url: string) => `🔥 Discover what happens next! Full story here: ${url}`,
  (url: string) => `📖 Curious about what happens next? Read the full story here: ${url}`,
  (url: string) => `✨ Check out the continuation and full article here: ${url}`,
  (url: string) => `👇 Continue reading the full story: ${url}`,
];

export function ztteam_getRandomViralComment(url: string, seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % ZTTEAM_VIRAL_COMMENT_TEMPLATES.length;
    return ZTTEAM_VIRAL_COMMENT_TEMPLATES[idx](url);
  }
  const randomIdx = Math.floor(Math.random() * ZTTEAM_VIRAL_COMMENT_TEMPLATES.length);
  return ZTTEAM_VIRAL_COMMENT_TEMPLATES[randomIdx](url);
}

@Injectable()
export class ZTTeamReelViralMonitorCron {
  private readonly logger = new Logger(ZTTeamReelViralMonitorCron.name);
  private isScanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookService: ZTTeamFacebookService,
    private readonly telegramService: TelegramService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * ZTTeam: Cron định kỳ quét mốc Views của các Video Reel
   * Chu kỳ: Mỗi 15 phút
   * Tối ưu hóa: Chỉ gọi 1 request Graph API cho mỗi Fanpage để chống quá tải và tránh Rate Limit
   */
  @Cron('0 */15 * * * *')
  async ztteam_handleViralCron() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      return;
    }

    if (this.isScanning) {
      this.logger.warn('[Viral Monitor] Lượt quét trước vẫn đang chạy, bỏ qua chu kỳ này');
      return;
    }

    this.isScanning = true;
    try {
      await this.ztteam_scanAndProcessViralReels();
    } catch (err: any) {
      this.logger.error(`[Viral Monitor] Lỗi trong tiến trình quét Viral: ${err.message}`);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Quét và xử lý các bài Reel đạt mốc 1,000 / 4,000 views
   */
  async ztteam_scanAndProcessViralReels() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    this.logger.log('[Viral Monitor] Bắt đầu quét kiểm tra lượt Views của các Reel đăng trong 7 ngày qua...');

    /** 1. Thu thập các bài viết đã xuất bản từ cả 2 bảng (ztteam_images & ztteam_reels) */
    const publishedImages = await this.prisma.ztteam_images.findMany({
      where: {
        is_posted: true,
        fb_post_id: { not: null },
        posted_at: { gte: sevenDaysAgo },
      },
      include: { page: true },
    });

    const publishedReels = await this.prisma.ztteam_reels.findMany({
      where: {
        is_posted: true,
        fb_post_id: { not: null },
        posted_at: { gte: sevenDaysAgo },
      },
      include: { page: true },
    });

    /** Chuẩn hóa danh sách bài viết */
    const allPosts: Array<{
      postId: string;
      postType: 'image' | 'reel';
      fbPostId: string;
      pageId: string;
      page: any;
      title: string;
      url: string;
      postedAt: Date;
    }> = [];

    for (const img of publishedImages) {
      if (img.fb_post_id && img.page_id && img.page) {
        allPosts.push({
          postId: img.id,
          postType: 'image',
          fbPostId: img.fb_post_id,
          pageId: img.page_id,
          page: img.page,
          title: img.wp_post_title || 'Bài viết',
          url: img.wp_post_url || '',
          postedAt: img.posted_at || img.created_at,
        });
      }
    }

    for (const reel of publishedReels) {
      if (reel.fb_post_id && reel.page_id && reel.page) {
        allPosts.push({
          postId: reel.id,
          postType: 'reel',
          fbPostId: reel.fb_post_id,
          pageId: reel.page_id,
          page: reel.page,
          title: reel.wp_post_title || 'Video Reel',
          url: reel.wp_post_url || '',
          postedAt: reel.posted_at || reel.created_at,
        });
      }
    }

    if (allPosts.length === 0) {
      this.logger.log('[Viral Monitor] Không có bài Reel nào được đăng trong 7 ngày qua.');
      return;
    }

    this.logger.log(`[Viral Monitor] Tìm thấy ${allPosts.length} bài Reel cần kiểm tra lượt xem.`);

    /** 2. Gom nhóm theo từng Fanpage để tối ưu số lần gọi Graph API */
    const postsByPage = new Map<string, typeof allPosts>();
    for (const item of allPosts) {
      if (!postsByPage.has(item.pageId)) {
        postsByPage.set(item.pageId, []);
      }
      postsByPage.get(item.pageId)!.push(item);
    }

    let totalChecked = 0;
    let viral1kCount = 0;
    let viral4kCount = 0;

    /** 3. Duyệt từng Fanpage */
    for (const [pageId, pagePosts] of postsByPage.entries()) {
      const page = pagePosts[0].page;

      /** Kiểm tra trạng thái an toàn của Page */
      if (!page.page_token_encrypted || !page.fb_page_id) {
        continue;
      }
      if (page.is_active === false || page.token_status === 'checkpoint_required' || page.token_status === 'expired') {
        this.logger.warn(`[Viral Monitor] Bỏ qua Fanpage "${page.name}" do đang bị tạm ngưng hoặc checkpoint.`);
        continue;
      }

      try {
        /** 
         * Gọi 1 request duy nhất đến Graph API lấy danh sách video và views của Page 
         */
        const vidUrl = `https://graph.facebook.com/v21.0/${page.fb_page_id}/videos?fields=id,views,permalink_url&limit=50&access_token=${page.page_token_encrypted}`;
        const response = await firstValueFrom(this.httpService.get(vidUrl, { timeout: 15000 }));
        const videoList: any[] = response.data?.data || [];

        /** Map video ID sang { views, permalink } */
        const videoMetricsMap = new Map<string, { views: number; permalinkUrl?: string }>();
        for (const v of videoList) {
          const vw = Number(v.views) || 0;
          videoMetricsMap.set(v.id, { views: vw, permalinkUrl: v.permalink_url });
        }

        /** Đối chiếu với từng bài viết của hệ thống trên Page này */
        for (const post of pagePosts) {
          totalChecked++;

          /** Tìm theo fbPostId hoặc các biến thể */
          const cleanFbId = post.fbPostId.includes('_') ? post.fbPostId.split('_')[1] : post.fbPostId;
          const metric = videoMetricsMap.get(post.fbPostId) || videoMetricsMap.get(cleanFbId);

          if (!metric) {
            continue;
          }

          const currentViews = metric.views;

          /** Lấy hoặc tạo bản ghi theo dõi trong ztteam_reel_milestones */
          let milestone = await (this.prisma as any).ztteam_reel_milestones.findUnique({
            where: { post_id: post.postId },
          });

          if (!milestone) {
            milestone = await (this.prisma as any).ztteam_reel_milestones.create({
              data: {
                post_id: post.postId,
                post_type: post.postType,
                fb_post_id: post.fbPostId,
                page_id: post.pageId,
                current_views: currentViews,
              },
            });
          } else {
            /** Cập nhật lượt view mới nhất */
            await (this.prisma as any).ztteam_reel_milestones.update({
              where: { post_id: post.postId },
              data: { current_views: currentViews },
            });
          }

          const reelUrl = metric.permalinkUrl
            ? (metric.permalinkUrl.startsWith('http') ? metric.permalinkUrl : `https://facebook.com${metric.permalinkUrl}`)
            : `https://facebook.com/${post.fbPostId}`;

          const cleanWebUrl = post.url.trim();

          /**
           * XỬ LÝ MỐC 1: ĐẠT TỐI THIỂU 1,000 VIEWS
           */
          if (currentViews >= 1000 && !milestone.notified_1k) {
            viral1kCount++;
            this.logger.log(`[Viral 1K] Reel "${post.title}" trên page "${page.name}" đạt ${currentViews} views!`);

            let commentSuccess = false;
            let commentFbId: string | null = null;

            /** Hành động A: Tự động Comment Link bài viết (không gắn tracking UTM) */
            if (cleanWebUrl && !milestone.commented_link) {
              try {
                const commentText = ztteam_getRandomViralComment(cleanWebUrl, post.postId);
                const commentRes = await this.facebookService.ztteam_publishComment(
                  page.fb_page_id,
                  post.fbPostId,
                  commentText
                );
                commentSuccess = true;
                commentFbId = commentRes?.id || null;
                this.logger.log(`[Viral 1K - Comment] Đã comment link thành công cho bài ${post.postId}`);
              } catch (cmtErr: any) {
                this.logger.error(`[Viral 1K - Comment] Lỗi comment link: ${cmtErr.message}`);
              }
            }

            /** Hành động B: Báo tin tức mừng về Telegram */
            const teleMsg = this.ztteam_format1kAlert({
              fanpageName: page.name,
              postTitle: post.title,
              views: currentViews,
              reelUrl: reelUrl,
              websiteUrl: cleanWebUrl,
              isCommented: commentSuccess || milestone.commented_link,
            });
            await this.telegramService.ztteam_sendMessage(teleMsg).catch(() => {});

            /** Cập nhật mốc 1K vào database */
            await (this.prisma as any).ztteam_reel_milestones.update({
              where: { post_id: post.postId },
              data: {
                notified_1k: true,
                notified_1k_at: new Date(),
                commented_link: commentSuccess ? true : milestone.commented_link,
                commented_link_at: commentSuccess ? new Date() : milestone.commented_link_at,
                comment_fb_id: commentFbId || milestone.comment_fb_id,
              },
            });
          }

          /**
           * XỬ LÝ MỐC 2: ĐẠT TỐI THIỂU 4,000 VIEWS (SIÊU VIRAL)
           */
          if (currentViews >= 4000 && !milestone.notified_4k) {
            viral4kCount++;
            this.logger.log(`[Viral 4K] Reel "${post.title}" trên page "${page.name}" đạt ${currentViews} views (Siêu Viral)!`);

            let commentSuccess = false;
            let commentFbId: string | null = null;

            /** Fallback nếu ở mốc 1K chưa kịp comment link */
            if (cleanWebUrl && !milestone.commented_link) {
              try {
                const commentText = ztteam_getRandomViralComment(cleanWebUrl, post.postId);
                const commentRes = await this.facebookService.ztteam_publishComment(
                  page.fb_page_id,
                  post.fbPostId,
                  commentText
                );
                commentSuccess = true;
                commentFbId = commentRes?.id || null;
              } catch (cmtErr: any) {
                this.logger.error(`[Viral 4K - Comment Fallback] Lỗi comment link: ${cmtErr.message}`);
              }
            }

            /** Hành động B: Báo tin Siêu Viral về Telegram */
            const teleMsg = this.ztteam_format4kAlert({
              fanpageName: page.name,
              postTitle: post.title,
              views: currentViews,
              reelUrl: reelUrl,
              websiteUrl: cleanWebUrl,
            });
            await this.telegramService.ztteam_sendMessage(teleMsg).catch(() => {});

            /** Cập nhật mốc 4K vào database */
            await (this.prisma as any).ztteam_reel_milestones.update({
              where: { post_id: post.postId },
              data: {
                notified_4k: true,
                notified_4k_at: new Date(),
                commented_link: commentSuccess ? true : milestone.commented_link,
                commented_link_at: commentSuccess ? new Date() : milestone.commented_link_at,
                comment_fb_id: commentFbId || milestone.comment_fb_id,
              },
            });
          }
        }
      } catch (pageErr: any) {
        this.logger.warn(`[Viral Monitor] Lỗi truy vấn Graph API cho Page "${page.name}": ${pageErr.message}`);
      }
    }

    this.logger.log(`[Viral Monitor] Kết thúc quét: Đã kiểm tra ${totalChecked} bài | Phát hiện ${viral1kCount} mốc 1K | Phát hiện ${viral4kCount} mốc 4K.`);
  }

  /**
   * Định dạng tin nhắn Telegram mốc 1,000 Views
   */
  private ztteam_format1kAlert(params: {
    fanpageName: string;
    postTitle: string;
    views: number;
    reelUrl: string;
    websiteUrl: string;
    isCommented: boolean;
  }): string {
    const { fanpageName, postTitle, views, reelUrl, websiteUrl, isCommented } = params;
    let msg = `🚀 *[REEL VIRAL ĐẠT 1,000 VIEWS]*\n\n`;
    msg += `🚩 *Fanpage:* ${fanpageName}\n`;
    msg += `📄 *Bài viết:* ${postTitle}\n`;
    msg += `👁 *Lượt xem:* ${views.toLocaleString()} views\n`;
    msg += `🔗 *Link Reel:* ${reelUrl}\n`;
    if (websiteUrl) {
      msg += `🌐 *Link Website:* ${websiteUrl}\n`;
    }
    msg += `💬 *Tự động bình luận:* ${isCommented ? '✅ Đã comment link bài viết lên Facebook!' : '⚠️ Chưa comment được link'}\n`;
    msg += `\n_Hệ thống sẽ tiếp tục theo dõi để báo mốc 4,000 views!_`;
    return msg;
  }

  /**
   * Định dạng tin nhắn Telegram mốc 4,000 Views
   */
  private ztteam_format4kAlert(params: {
    fanpageName: string;
    postTitle: string;
    views: number;
    reelUrl: string;
    websiteUrl: string;
  }): string {
    const { fanpageName, postTitle, views, reelUrl, websiteUrl } = params;
    let msg = `🔥 *[REEL SIÊU VIRAL ĐẠT 4,000 VIEWS]*\n\n`;
    msg += `🚩 *Fanpage:* ${fanpageName}\n`;
    msg += `📄 *Bài viết:* ${postTitle}\n`;
    msg += `👁 *Lượt xem:* ${views.toLocaleString()} views\n`;
    msg += `🔗 *Link Reel:* ${reelUrl}\n`;
    if (websiteUrl) {
      msg += `🌐 *Link Website:* ${websiteUrl}\n`;
    }
    msg += `⚡ *Đánh giá:* Reel đang tăng trưởng cực kỳ mạnh mẽ!\n`;
    msg += `\n_Hệ thống ZT-Reel tự động phân phối và theo dõi hiệu suất._`;
    return msg;
  }
}
