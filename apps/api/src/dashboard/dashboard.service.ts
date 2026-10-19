import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFacebookService } from '../facebook/facebook.service';

@Injectable()
export class ZTTeamDashboardService {
  private readonly logger = new Logger(ZTTeamDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookService: ZTTeamFacebookService
  ) {}

  async ztteam_getStats(userId: string, pageId?: string, siteId?: string, targetUserId?: string) {
    const caller = await this.prisma.ztteam_users.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdmin = caller?.role === 'ADMIN';

    const accountWhere: any = {};
    if (!isAdmin || targetUserId) {
      accountWhere.owner_user_id = targetUserId || userId;
    }

    const fbAccounts = await this.prisma.ztteam_fb_accounts.findMany({
      where: accountWhere,
      select: { id: true },
    });
    const accountIds = fbAccounts.map(a => a.id);

    const pageWhere: any = { fb_account_id: { in: accountIds }, is_active: true };
    if (pageId) pageWhere.id = pageId;

    const pages = await this.prisma.ztteam_pages.findMany({
      where: pageWhere,
      select: { id: true },
    });
    const pageIds = pages.map(p => p.id);
    const totalPages = pageIds.length;

    /** 2. Get user's target sites and sources */
    const siteWhere: any = { owner_user_id: userId };
    if (siteId) siteWhere.id = siteId;

    const targetSites = await this.prisma.ztteam_target_sites.findMany({
      where: siteWhere,
      select: { id: true },
    });
    const siteIds = targetSites.map(s => s.id);

    const sources = await this.prisma.ztteam_crawl_sources.findMany({
      where: { target_site_id: { in: siteIds } },
      select: { id: true },
    });
    const sourceIds = sources.map(s => s.id);

    const totalCrawled = await this.prisma.ztteam_crawl_history.count({
      where: { source_id: { in: sourceIds } },
    });

    /** 3. Reels & Images Stats (Gộp cả video Remotion và video AI Hook) */
    const [reelsCreated, imagesCreated] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: { page_id: { in: pageIds } },
      }),
      this.prisma.ztteam_images.count({
        where: { page_id: { in: pageIds } },
      }),
    ]);
    const totalReelsCreated = reelsCreated + imagesCreated;

    const [reelsPublished, imagesPublished] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: { page_id: { in: pageIds }, is_posted: true },
      }),
      this.prisma.ztteam_images.count({
        where: { page_id: { in: pageIds }, is_posted: true },
      }),
    ]);
    const totalReelsPublished = reelsPublished + imagesPublished;

    const [reelsFailed, imagesFailed] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: { page_id: { in: pageIds }, status: 'FAILED' },
      }),
      this.prisma.ztteam_images.count({
        where: { page_id: { in: pageIds }, status: 'FAILED' },
      }),
    ]);
    const totalFailed = reelsFailed + imagesFailed;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const crawledToday = await this.prisma.ztteam_crawl_history.count({
      where: {
        source_id: { in: sourceIds },
        created_at: { gte: today },
      },
    });

    const [reelsPublishedToday, imagesPublishedToday] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: {
          page_id: { in: pageIds },
          is_posted: true,
          posted_at: { gte: today },
        },
      }),
      this.prisma.ztteam_images.count({
        where: {
          page_id: { in: pageIds },
          is_posted: true,
          posted_at: { gte: today },
        },
      }),
    ]);
    const publishedToday = reelsPublishedToday + imagesPublishedToday;

    const successRate = totalReelsCreated > 0 
      ? Math.round((totalReelsPublished / (totalReelsPublished + totalFailed || 1)) * 100) 
      : 100;

    /** 4. Alerts */
    const expiredPages = await this.prisma.ztteam_pages.findMany({
      where: { fb_account_id: { in: accountIds }, token_status: { not: 'active' } },
      select: { name: true }
    });
    
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const [failedReelsToday, failedImagesToday] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: { page_id: { in: pageIds }, status: 'FAILED', updated_at: { gte: startOfDay } }
      }),
      this.prisma.ztteam_images.count({
        where: { page_id: { in: pageIds }, status: 'FAILED', updated_at: { gte: startOfDay } }
      }),
    ]);
    const failedToday = failedReelsToday + failedImagesToday;

    const alerts = [];
    if (expiredPages.length > 0) {
      alerts.push({
        type: 'TOKEN_EXPIRED',
        title: 'Token Facebook Hết Hạn',
        message: `${expiredPages.length} Facebook Page (${expiredPages.map(p => p.name).join(', ')}) yêu cầu xác thực lại token.`
      });
    }
    if (failedToday > 0) {
      alerts.push({
        type: 'RENDER_ERROR',
        title: 'AI Render Error',
        message: `${failedToday} Job AI Reel Factory đang bị lỗi hôm nay.`
      });
    }

    /** 5. Recent Activities */
    const recentReels = await this.prisma.ztteam_reels.findMany({
      where: { page_id: { in: pageIds } },
      orderBy: { updated_at: 'desc' },
      take: 20,
      include: { page: true }
    });

    const recentImages = await this.prisma.ztteam_images.findMany({
      where: { page_id: { in: pageIds } },
      orderBy: { updated_at: 'desc' },
      take: 20,
      include: { page: true }
    });

    const recentCrawls = await this.prisma.ztteam_crawl_history.findMany({
      where: { source_id: { in: sourceIds }, status: 'SUCCESS' },
      orderBy: { created_at: 'desc' },
      take: 20,
      include: { source: { include: { target_site: true } } }
    });

    const activities: any[] = [];
    
    recentCrawls.forEach(c => {
      activities.push({
        id: `crawl_${c.id}`,
        type: 'CRAWL',
        title: c.title || 'Bài viết mới',
        status: c.status,
        date: c.created_at,
        sourceName: c.source?.source_url || '',
        targetSiteName: c.source?.target_site?.wp_url || ''
      });
    });

    recentReels.forEach(r => {
      activities.push({
        id: `vid_create_${r.id}`,
        type: 'CREATE_VIDEO',
        title: r.wp_post_title || 'Video không tiêu đề',
        status: r.status,
        date: r.created_at,
        pageName: r.page?.name || ''
      });
      if (r.is_posted && r.posted_at) {
        activities.push({
          id: `vid_post_${r.id}`,
          type: 'POST_FACEBOOK',
          title: r.wp_post_title || 'Video',
          status: 'POSTED',
          date: r.posted_at,
          pageName: r.page?.name || '',
          pageAvatar: r.page?.avatar || '',
          postUrl: r.fb_post_id ? `https://facebook.com/${r.fb_post_id}` : ''
        });
      }
    });

    recentImages.forEach(img => {
      activities.push({
        id: `img_create_${img.id}`,
        type: 'CREATE_IMAGE',
        title: img.wp_post_title || 'Ảnh không tiêu đề',
        status: img.status,
        date: img.created_at,
        pageName: img.page?.name || ''
      });
      if (img.is_posted && img.posted_at) {
        activities.push({
          id: `img_post_${img.id}`,
          type: 'POST_FACEBOOK',
          title: img.wp_post_title || 'Ảnh',
          status: 'POSTED',
          date: img.posted_at,
          pageName: img.page?.name || '',
          pageAvatar: img.page?.avatar || '',
          postUrl: img.fb_post_id ? `https://facebook.com/${img.fb_post_id}` : ''
        });
      }
    });

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    const topActivities = activities.slice(0, 20);

    /** 6. System Health */
    const [queuedReels, queuedImages] = await Promise.all([
      this.prisma.ztteam_reels.count({
        where: { page_id: { in: pageIds }, status: 'QUEUED' }
      }),
      this.prisma.ztteam_images.count({
        where: { page_id: { in: pageIds }, status: 'QUEUED' }
      }),
    ]);
    const totalQueued = queuedReels + queuedImages;

    const pagesWithFollowers = await this.prisma.ztteam_pages.findMany({
      where: pageWhere,
      select: { follower_count: true },
    });
    const totalFollowers = pagesWithFollowers.reduce((sum, p) => sum + (p.follower_count || 0), 0);
    
    const health = {
      crawler: { status: 'Hoạt động', details: 'OK' },
      factory: { status: 'Đang xử lý', details: `${totalQueued} luồng đang chờ` },
      publisher: { status: 'Sẵn sàng', details: `Queue: ${totalQueued}` }
    };

    return {
      totalPages,
      totalCrawled,
      totalReelsCreated,
      totalReelsPublished,
      totalFollowers,
      publishedToday,
      crawledToday,
      successRate,
      alerts,
      activities: topActivities,
      health
    };
  }

  async ztteam_getChartData(userId: string, days: number = 7, pageId?: string, siteId?: string, targetUserId?: string) {
    const caller = await this.prisma.ztteam_users.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdmin = caller?.role === 'ADMIN';

    const accountWhere: any = {};
    if (!isAdmin || targetUserId) {
      accountWhere.owner_user_id = targetUserId || userId;
    }

    const fbAccounts = await this.prisma.ztteam_fb_accounts.findMany({
      where: accountWhere,
      select: { id: true },
    });
    const accountIds = fbAccounts.map(a => a.id);
    
    let pages = await this.prisma.ztteam_pages.findMany({
      where: { fb_account_id: { in: accountIds }, is_active: true },
      select: { id: true, name: true, avatar: true, branding_avatar_url: true, fb_page_id: true, page_token_encrypted: true, follower_count: true },
    });

    /** Apply siteId filter if selected */
    const siteWhere: any = {};
    if (!isAdmin || targetUserId) {
      siteWhere.owner_user_id = targetUserId || userId;
    }
    if (siteId) siteWhere.id = siteId;

    const targetSites = await this.prisma.ztteam_target_sites.findMany({
      where: siteWhere,
      select: { id: true, wp_url: true },
    });
    const siteIds = targetSites.map(s => s.id);
    
    const sources = await this.prisma.ztteam_crawl_sources.findMany({
      where: { target_site_id: { in: siteIds } },
      select: { id: true, target_site_id: true },
    });
    const sourceIds = sources.map(s => s.id);

    if (siteId) {
      const sitePages = await this.prisma.ztteam_pages.findMany({
        where: {
          fb_account_id: { in: accountIds },
          is_active: true,
          sources: { some: { target_site_id: siteId } }
        },
        select: { id: true }
      });
      const allowedPageIds = new Set(sitePages.map(p => p.id));
      pages = pages.filter(p => allowedPageIds.has(p.id));
    }

    /** Apply pageId filter if selected */
    if (pageId) {
      pages = pages.filter(p => p.id === pageId || p.fb_page_id === pageId);
    }

    const pageIds = pages.map(p => p.id);

    /** Build mappings and distinct names for initializing 0 */
    const sourceToSiteName = new Map<string, string>();
    const allSiteNames = new Set<string>();
    sources.forEach(s => {
      const site = targetSites.find(ts => ts.id === s.target_site_id);
      if (site) {
        const cleanName = site.wp_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        sourceToSiteName.set(s.id, cleanName);
        allSiteNames.add(cleanName);
      }
    });

    const allPageNames = pages.map(p => p.name);

    /** Khởi tạo các biến tổng quan */
    let overviewMediaViews = 0;
    let overviewUniqueReach = 0;
    let overviewEngagements = 0;
    let overviewNewFollowers = 0;
    const totalFollowers = pages.reduce((sum, p) => sum + (p.follower_count || 0), 0);

    const chartData = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const startOfDay = new Date(d.setHours(0,0,0,0));
      const endOfDay = new Date(d.setHours(23,59,59,999));

      const dailyCrawledRaw = await this.prisma.ztteam_crawl_history.groupBy({
        by: ['source_id'],
        where: {
          source_id: { in: sourceIds },
          created_at: { gte: startOfDay, lte: endOfDay },
          status: 'SUCCESS'
        },
        _count: { id: true }
      });

      /** ZTTeam: Thống kê số bài viết tạo (Gộp cả Reels và Images) */
      const [dailyCreatedReelsRaw, dailyCreatedImagesRaw] = await Promise.all([
        this.prisma.ztteam_reels.groupBy({
          by: ['page_id'],
          where: {
            page_id: { in: pageIds },
            created_at: { gte: startOfDay, lte: endOfDay }
          },
          _count: { id: true }
        }),
        this.prisma.ztteam_images.groupBy({
          by: ['page_id'],
          where: {
            page_id: { in: pageIds },
            created_at: { gte: startOfDay, lte: endOfDay }
          },
          _count: { id: true }
        }),
      ]);

      /** ZTTeam: Thống kê số bài viết đã xuất bản (Gộp cả Reels và Images) */
      const [dailyPublishedReelsRaw, dailyPublishedImagesRaw] = await Promise.all([
        this.prisma.ztteam_reels.groupBy({
          by: ['page_id'],
          where: {
            page_id: { in: pageIds },
            is_posted: true,
            posted_at: { gte: startOfDay, lte: endOfDay }
          },
          _count: { id: true }
        }),
        this.prisma.ztteam_images.groupBy({
          by: ['page_id'],
          where: {
            page_id: { in: pageIds },
            is_posted: true,
            posted_at: { gte: startOfDay, lte: endOfDay }
          },
          _count: { id: true }
        }),
      ]);

      const dataPoint: any = { name: dateStr.split('-').slice(1).join('/') };
      
      /** Initialize ALL sites and pages to 0 for Recharts continuous rendering */
      allSiteNames.forEach(siteName => dataPoint[`crawl_${siteName}`] = 0);
      allPageNames.forEach(pageName => {
        dataPoint[`pub_${pageName}`] = 0;
        dataPoint[`create_${pageName}`] = 0;
      });
      
      let totalCrawledForDay = 0;
      dailyCrawledRaw.forEach(c => {
        const siteName = sourceToSiteName.get(c.source_id);
        if (siteName) dataPoint[`crawl_${siteName}`] += c._count.id;
        totalCrawledForDay += c._count.id;
      });

      let totalPublishedForDay = 0;
      dailyPublishedReelsRaw.forEach(p => {
        const page = pages.find(pg => pg.id === p.page_id);
        if (page) dataPoint[`pub_${page.name}`] += p._count.id;
        totalPublishedForDay += p._count.id;
      });
      dailyPublishedImagesRaw.forEach(p => {
        const page = pages.find(pg => pg.id === p.page_id);
        if (page) dataPoint[`pub_${page.name}`] += p._count.id;
        totalPublishedForDay += p._count.id;
      });

      let totalCreatedForDay = 0;
      dailyCreatedReelsRaw.forEach(r => {
        const page = pages.find(pg => pg.id === r.page_id);
        if (page) dataPoint[`create_${page.name}`] += r._count.id;
        totalCreatedForDay += r._count.id;
      });
      dailyCreatedImagesRaw.forEach(r => {
        const page = pages.find(pg => pg.id === r.page_id);
        if (page) dataPoint[`create_${page.name}`] += r._count.id;
        totalCreatedForDay += r._count.id;
      });
      
      dataPoint['crawled'] = totalCrawledForDay;
      dataPoint['created'] = totalCreatedForDay;
      dataPoint['published'] = totalPublishedForDay;

      chartData.push(dataPoint);
    }

    /** ZTTeam: 1. Lấy tất cả bài viết do chính hệ thống tạo và đăng trong khoảng thời gian đã chọn */
    const startDate = new Date(Date.now() - days * 86400 * 1000);

    const [systemImages, systemReels] = await Promise.all([
      this.prisma.ztteam_images.findMany({
        where: {
          page_id: { in: pageIds },
          is_posted: true,
          fb_post_id: { not: null },
          posted_at: { gte: startDate },
        },
        select: {
          id: true,
          page_id: true,
          fb_post_id: true,
          wp_post_title: true,
          image_url: true,
          video_url: true,
          posted_at: true,
        },
      }),
      this.prisma.ztteam_reels.findMany({
        where: {
          page_id: { in: pageIds },
          is_posted: true,
          fb_post_id: { not: null },
          posted_at: { gte: startDate },
        },
        select: {
          id: true,
          page_id: true,
          fb_post_id: true,
          wp_post_title: true,
          thumbnail_url: true,
          video_url: true,
          posted_at: true,
        },
      }),
    ]);

    const pageToSystemPostIds = new Map<string, Set<string>>();
    const systemPostsByFbId = new Map<string, any>();

    [...systemImages, ...systemReels].forEach((p) => {
      if (p.page_id && p.fb_post_id) {
        if (!pageToSystemPostIds.has(p.page_id)) {
          pageToSystemPostIds.set(p.page_id, new Set());
        }
        pageToSystemPostIds.get(p.page_id)!.add(p.fb_post_id);
        systemPostsByFbId.set(p.fb_post_id, p);
      }
    });

    const leaderboard: any[] = [];
    const allSystemVideoObjects: any[] = [];

    await Promise.all(
      pages.map(async (page) => {
        /** Lấy sản lượng của page */
        const [pageReels, pageImages] = await Promise.all([
          this.prisma.ztteam_reels.groupBy({
            by: ['status', 'is_posted'],
            where: { page_id: page.id, OR: [{ is_posted: true }, { status: 'FAILED' }] },
            _count: { id: true },
          }),
          this.prisma.ztteam_images.groupBy({
            by: ['status', 'is_posted'],
            where: { page_id: page.id, OR: [{ is_posted: true }, { status: 'FAILED' }] },
            _count: { id: true },
          }),
        ]);

        let published = 0;
        let failed = 0;
        pageReels.forEach((r) => {
          if (r.is_posted) published += r._count.id;
          if (r.status === 'FAILED') failed += r._count.id;
        });
        pageImages.forEach((img) => {
          if (img.is_posted) published += img._count.id;
          if (img.status === 'FAILED') failed += img._count.id;
        });

        const sysPostIds = pageToSystemPostIds.get(page.id) || new Set<string>();
        let pageViews = 0;
        let pageReach = 0;
        let systemVideoReach = 0;
        let pageNewFollowers = 0;
        let pageInteractions = 0;

        /** ZTTeam: Truy vấn video views và blue_reels_play_count (reach duy nhất) chuẩn API Facebook */
        if (page.page_token_encrypted && page.fb_page_id) {
          try {
            const vidUrl = new URL(`https://graph.facebook.com/v21.0/${page.fb_page_id}/videos`);
            vidUrl.searchParams.set('fields', 'id,views,created_time,description,picture,thumbnails{uri,is_preferred,height,width},permalink_url,video_insights.metric(blue_reels_play_count){values}');
            vidUrl.searchParams.set('limit', '100');
            vidUrl.searchParams.set('access_token', page.page_token_encrypted);

            const vidRes = await fetch(vidUrl.toString());
            const vidData = await vidRes.json();
            const videos = vidData?.data || [];

            for (const v of videos) {
              if (sysPostIds.has(v.id)) {
                const vViews = Number(v.views) || 0;
                pageViews += vViews;

                /** ZTTeam: Lấy lượt người xem duy nhất (unique reach) thực tế từ API Facebook */
                const bluePlays = v.video_insights?.data?.[0]?.values?.[0]?.value;
                const vReach = typeof bluePlays === 'number' ? bluePlays : 0;
                systemVideoReach += vReach;

                const sysPost = systemPostsByFbId.get(v.id);
                /** ZTTeam: Ưu tiên lấy Thumbnail video Reel thực tế từ Facebook CDN (chuẩn HD hoặc picture), đồng bộ chuẩn xác với trang chi tiết Fanpage */
                const ztteam_fbVideoThumb = v.thumbnails?.data?.find((t: any) => t.is_preferred)?.uri || v.picture;
                const ztteam_finalThumbnail = ztteam_fbVideoThumb || sysPost?.thumbnail_url || (sysPost?.image_url && sysPost.image_url.startsWith('http') ? sysPost.image_url : null) || 'https://placehold.co/1080x1920/2563eb/white?text=ZTTeam';

                allSystemVideoObjects.push({
                  id: v.id,
                  title: sysPost?.wp_post_title || v.description?.slice(0, 100) || 'Video do hệ thống đăng',
                  thumbnail: ztteam_finalThumbnail,
                  pageName: page.name,
                  date: v.created_time || sysPost?.posted_at,
                  views: vViews,
                  reactions: 0,
                  comments: 0,
                  shares: 0,
                  engagements: vViews,
                  videoUrl: v.permalink_url ? `https://facebook.com${v.permalink_url}` : `https://facebook.com/${v.id}`,
                });
              }
            }
          } catch (vidErr: any) {
            this.logger.warn(`Lỗi lấy video views cho ${page.name}: ${vidErr.message}`);
          }

          /** ZTTeam: Lấy insights từ Facebook: Reach trang, Follower mới, Tương tác */
          try {
            const report = await this.facebookService.ztteam_getPageInsights(page.id, userId);
            if (Array.isArray(report)) {
              const reachMetric = report.find((m: any) => m.name === 'page_total_media_view_unique');
              if (reachMetric?.values) {
                const insReach = reachMetric.values.slice(-days).reduce((s: number, v: any) => s + (v.value || 0), 0);
                pageReach = insReach;
              }
              const followMetric = report.find((m: any) => m.name === 'page_daily_follows');
              if (followMetric?.values) {
                pageNewFollowers = followMetric.values.slice(-days).reduce((s: number, v: any) => s + (v.value || 0), 0);
              }
              const engMetric = report.find((m: any) => m.name === 'page_post_engagements');
              if (engMetric?.values) {
                pageInteractions = engMetric.values.slice(-days).reduce((s: number, v: any) => s + (v.value || 0), 0);
              }
            }
          } catch (insErr: any) {
            this.logger.warn(`Lỗi lấy insights cho ${page.name}: ${insErr.message}`);
          }
        }

        /** ZTTeam: Tiếp cận thực tế lấy số lớn nhất giữa Reach trang của Facebook và Reach video realtime của Facebook, tuyệt đối không dùng hệ số ảo */
        pageReach = Math.max(pageReach, systemVideoReach);

        leaderboard.push({
          pageId: page.id,
          pageName: page.name,
          avatar: (page as any).branding_avatar_url || page.avatar,
          totalReels: published + failed,
          published,
          rate: published + failed > 0 ? Math.round((published / (published + failed)) * 100) : 100,
          fbPageId: page.fb_page_id,
          pageToken: page.page_token_encrypted,
          interactions: pageInteractions,
          views: pageViews,
          reach: pageReach,
          followers: page.follower_count || 0,
          newFollowers: pageNewFollowers,
          systemPostsCount: sysPostIds.size,
        });
      })
    );

    /** ZTTeam: Tạo 3 Bảng Xếp Hạng chuyên sâu theo từng tiêu chí */
    const topByViews = [...leaderboard].sort((a, b) => (b.views || 0) - (a.views || 0) || (b.published || 0) - (a.published || 0));
    const topByReach = [...leaderboard].sort((a, b) => (b.reach || 0) - (a.reach || 0) || (b.views || 0) - (a.views || 0));
    const topByFollowers = [...leaderboard].sort((a, b) => (b.newFollowers || 0) - (a.newFollowers || 0) || (b.followers || 0) - (a.followers || 0));

    /** ZTTeam: Tổng hợp số liệu tổng quan chuẩn chỉ từ các bài hệ thống đăng trong kỳ */
    overviewMediaViews = topByViews.reduce((sum, item) => sum + (item.views || 0), 0);
    overviewUniqueReach = topByReach.reduce((sum, item) => sum + (item.reach || 0), 0);
    overviewNewFollowers = topByFollowers.reduce((sum, item) => sum + (item.newFollowers || 0), 0);
    overviewEngagements = leaderboard.reduce((sum, item) => sum + (item.interactions || 0), 0);

    /** ZTTeam: Danh sách video nổi bật do hệ thống đăng xếp theo lượt xem giảm dần */
    allSystemVideoObjects.sort((a, b) => (b.views || 0) - (a.views || 0));
    const highlightedPosts = allSystemVideoObjects.slice(0, 15);

    return {
      overview: {
        totalMediaViews: overviewMediaViews,
        totalUniqueReach: overviewUniqueReach,
        totalEngagements: overviewEngagements,
        totalFollowers,
        newFollowers: overviewNewFollowers,
        totalSystemPosts: [...systemImages, ...systemReels].length,
      },
      chartData,
      leaderboard: topByViews.slice(0, 10),
      topByViews,
      topByReach,
      topByFollowers,
      highlightedPosts,
      details: highlightedPosts,
    };
  }
}
