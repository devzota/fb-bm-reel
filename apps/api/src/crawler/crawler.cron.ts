import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFetcherService } from './fetcher.service';
import { ZTTeamWordpressService } from '../wordpress/wordpress.service';
import { ZTTeamCrawlerService } from './crawler.service';
import Parser from 'rss-parser';
import { TelegramService, ztteam_extractErrorMessage } from '../telegram/telegram.service';

@Injectable()
export class ZTTeamCrawlerCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ZTTeamCrawlerCron.name);
  private rssParser: Parser;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcherService: ZTTeamFetcherService,
    private readonly wordpressService: ZTTeamWordpressService,
    private readonly telegramService: TelegramService,
    private readonly crawlerService: ZTTeamCrawlerService,
  ) {
    this.rssParser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
  }

  onApplicationBootstrap() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      this.logger.log('Auto-Crawler Cron is disabled via ENABLE_AUTO_CRON=false');
      return;
    }
    this.logger.log('Application started, triggering initial crawler run...');
    this.ztteam_handleCron();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async ztteam_handleCron() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      return;
    }
    if (this.isRunning) {
      this.logger.warn('Crawler cron is already running, skipping this tick');
      return;
    }
    this.isRunning = true;
    this.logger.log('Starting Auto-Crawler Cron...');

    try {
      const sources = await this.prisma.ztteam_crawl_sources.findMany({
        where: { enabled: true },
        include: { target_site: true },
        take: 50, /** Batch limit */
      });

      for (const source of sources) {
        if (!source.target_site) continue;
        
        /** Determine the interval in milliseconds based on frequency_cron */
        let intervalMs = 0;
        switch (source.frequency_cron) {
          case '0 */5 * * * *': intervalMs = 5 * 60 * 1000; break;
          case '0 */15 * * * *': intervalMs = 15 * 60 * 1000; break;
          case '0 */30 * * * *': intervalMs = 30 * 60 * 1000; break;
          case '0 */1 * * *': intervalMs = 1 * 60 * 60 * 1000; break;
          case '0 */2 * * *': intervalMs = 2 * 60 * 60 * 1000; break;
          case '0 */3 * * *': intervalMs = 3 * 60 * 60 * 1000; break;
          case '0 */4 * * *': intervalMs = 4 * 60 * 60 * 1000; break;
          case '0 */6 * * *': intervalMs = 6 * 60 * 60 * 1000; break;
          case '0 */12 * * *': intervalMs = 12 * 60 * 60 * 1000; break;
          case '0 0 * * *': intervalMs = 24 * 60 * 60 * 1000; break;
          default: intervalMs = 60 * 60 * 1000; /** Default 1 hour instead of 2 mins */
        }

        /** Check last crawl time */
        const lastCrawl = await this.prisma.ztteam_crawl_history.findFirst({
          where: { source_id: source.id },
          orderBy: { created_at: 'desc' }
        });

        if (lastCrawl) {
          const timeSinceLastCrawl = Date.now() - new Date(lastCrawl.created_at).getTime();
          if (timeSinceLastCrawl < intervalMs) {
            this.logger.debug(`Skipping source ${source.source_url} (Crawled recently. Next run in ${Math.round((intervalMs - timeSinceLastCrawl) / 60000)} mins)`);
            continue;
          }
        }

        this.logger.log(`Crawling source: ${source.source_url} for site: ${source.target_site.wp_url}`);
        
        try {
          await this.ztteam_crawlSource(source);
        } catch (error: any) {
          this.logger.error(`Failed to crawl source ${source.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Crawler cron failed: ${error.message}`);
    } finally {
      this.isRunning = false;
      this.logger.log('Auto-Crawler Cron finished.');
    }
  }

  private async ztteam_crawlSource(source: any) {
    /** 1. Extract URLs from the source (Assuming it's an RSS feed for now) */
    const urlsToFetch: string[] = [];
    
    try {
      const feed = await this.rssParser.parseURL(source.source_url);
      if (feed.items && feed.items.length > 0) {
        const baseUrl = new URL(source.source_url);
        /** Lọc chỉ lấy các item có URL thực sự là bài viết (loại bỏ category feed, author feed) */
        for (const item of feed.items) {
          if (item.link && this.fetcherService.ztteam_isArticleUrl(item.link, baseUrl.hostname)) {
            urlsToFetch.push(item.link);
            if (urlsToFetch.length >= 10) break;
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to parse RSS for ${source.source_url}, falling back to HTML scraping: ${error.message}`);
      
      /** Fallback: fetch HTML and extract article links */
      try {
        const html = await this.fetcherService.ztteam_fetchHtml(source.source_url);
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        
        /** Remove header, footer, nav, sidebars, menus, pagination, breadcrumbs to avoid scraping menu/page links */
        $('header, footer, nav, aside, .sidebar, .widget, .menu, #menu, .nav-menu, .navigation, .pagination, .breadcrumbs, .breadcrumb, .site-header, .site-footer, .top-bar, .sub-menu, .dropdown-menu').remove();
        
        const baseUrl = new URL(source.source_url);
        const extractedUrls = new Set<string>();

        /** TẦNG 2: Ưu tiên bóc tách từ các phần tử chứa bài viết theo ngữ cảnh */
        const articleSelectors = [
          'article a',
          'h1 a', 'h2 a', 'h3 a', 'h4 a',
          '.entry-title a', '.post-title a', '.card-title a', '.story-card a', '.article-card a',
          '.post-item a', '.blog-post a', '.story-item a', '.item-title a'
        ];

        $(articleSelectors.join(', ')).each((i: number, el: any) => {
          let href = $(el).attr('href');
          if (!href) return;
          try {
            if (href.startsWith('/')) {
              href = `${baseUrl.origin}${href}`;
            }
            const linkUrl = new URL(href);
            /** Kiểm tra qua Tầng 1: Heuristics & Morphology */
            if (this.fetcherService.ztteam_isArticleUrl(linkUrl.href, baseUrl.hostname)) {
              extractedUrls.add(linkUrl.href);
            }
          } catch (e) {
            /** Invalid URL, ignore */
          }
        });

        /** Nếu selectors chuyên biệt chưa tìm thấy đủ bài, quét toàn bộ thẻ <a> còn lại trong nội dung */
        if (extractedUrls.size < 5) {
          $('a').each((i: number, el: any) => {
            let href = $(el).attr('href');
            if (!href) return;
            try {
              if (href.startsWith('/')) {
                href = `${baseUrl.origin}${href}`;
              }
              const linkUrl = new URL(href);
              if (this.fetcherService.ztteam_isArticleUrl(linkUrl.href, baseUrl.hostname)) {
                extractedUrls.add(linkUrl.href);
              }
            } catch (e) {
              /** Invalid URL, ignore */
            }
          });
        }

        /** Take top 10 articles */
        urlsToFetch.push(...Array.from(extractedUrls).slice(0, 10));
        
        if (urlsToFetch.length === 0) {
          this.logger.log(`No direct HTML article links found on ${source.source_url}. Falling back to Smart Proxy extraction...`);
          const proxyLinks = await this.fetcherService.ztteam_extractArticleLinksViaProxy(source.source_url);
          urlsToFetch.push(...proxyLinks.slice(0, 10));
        }

        if (urlsToFetch.length === 0) {
          this.logger.warn(`Could not find any authentic article links on ${source.source_url}`);
        } else {
          this.logger.log(`Extracted ${urlsToFetch.length} authentic article links from ${source.source_url}`);
        }
      } catch (htmlError: any) {
        this.logger.warn(`Direct HTML scrape failed for ${source.source_url}: ${htmlError.message}. Attempting Smart Proxy extraction...`);
        try {
          const proxyLinks = await this.fetcherService.ztteam_extractArticleLinksViaProxy(source.source_url);
          urlsToFetch.push(...proxyLinks.slice(0, 10));
        } catch (proxyErr: any) {
          this.logger.error(`Smart proxy extraction also failed for ${source.source_url}: ${proxyErr.message}`);
          /** Tuyệt đối KHÔNG đẩy source.source_url vào urlsToFetch để tránh cào nhầm trang chủ */
        }
      }
    }

    if (urlsToFetch.length === 0) {
      this.logger.warn(`No URLs found for source ${source.source_url}`);
      await this.ztteam_markSourceSyncTime(source.id);
      return;
    }

    /** Mark sync time immediately to lock the crawl interval (e.g. 6 hours) */
    await this.ztteam_markSourceSyncTime(source.id);

    /** 2. Fetch data for un-crawled URLs: Batch size configured in extract_rules_json (default 1) */
    let processedCount = 0;
    let maxArticlesPerCycle = 1;

    try {
      const rules = JSON.parse(source.extract_rules_json || '{}');
      if (rules.batchSize && Number(rules.batchSize) > 0) {
        maxArticlesPerCycle = Math.max(1, Math.min(10, parseInt(rules.batchSize, 10)));
      }
    } catch (e) {}

    let attemptCount = 0;

    for (const url of urlsToFetch) {
      if (attemptCount >= maxArticlesPerCycle) {
        break;
      }

      /** Kiểm tra thời gian thực: Nếu người dùng đã gạt TẮT nguồn này, dừng ngay lập tức */
      const freshSource = await this.prisma.ztteam_crawl_sources.findUnique({
        where: { id: source.id },
        select: { enabled: true }
      });
      if (!freshSource || !freshSource.enabled) {
        this.logger.log(`Source ${source.id} was toggled OFF by user. Stopping crawl loop immediately.`);
        break;
      }

      try {
        /** Check history: Skip already successful or intentionally skipped articles, allow retry for FAILED */
        const history = await this.prisma.ztteam_crawl_history.findUnique({
          where: { source_id_url: { source_id: source.id, url } }
        });

        if (history && (history.status === 'SUCCESS' || history.status === 'SKIPPED_NOT_ARTICLE')) {
          continue;
        }

        /** Call full automated pipeline: Crawl clean story -> SangTao.ai 2K Image -> WordPress + 2K Featured Image -> Queue Fanpage (luân phiên Least-Loaded) */
        const result = await this.crawlerService.ztteam_crawlAndPublishStory({
          sourceId: source.id,
          sourceUrl: url,
          targetSiteId: source.target_site_id,
          sourceCategory: source.source_category,
        });

        await this.prisma.ztteam_crawl_history.upsert({
          where: { source_id_url: { source_id: source.id, url } },
          create: { source_id: source.id, url, title: result.title, status: 'SUCCESS' },
          update: { title: result.title, status: 'SUCCESS' }
        });

        this.logger.log(`Successfully processed story: "${result.title}" -> WP: ${result.wpPostUrl} | Fanpage Ready: ${result.imageId || 'N/A'}`);
        processedCount++;
        attemptCount++;
      } catch (err: any) {
        /** Kiểm tra nếu lỗi do vi phạm cổng kiểm duyệt bài viết (trang chuyên mục hoặc không đạt chuẩn nội dung) */
        const isNonArticle = err.message?.includes('Không phải bài viết hợp lệ') ||
                             err.message?.includes('Nội dung không đạt tiêu chuẩn bài viết');

        if (isNonArticle) {
          this.logger.log(`[TỰ ĐỘNG BỎ QUA] URL không phải bài viết: ${url} (${err.message})`);
          try {
            await this.prisma.ztteam_crawl_history.upsert({
              where: { source_id_url: { source_id: source.id, url } },
              create: { source_id: source.id, url, status: 'SKIPPED_NOT_ARTICLE' },
              update: { status: 'SKIPPED_NOT_ARTICLE' }
            });
          } catch (e) {}
          continue; /** Chuyển sang URL tiếp theo, không gửi cảnh báo lỗi Telegram */
        }

        attemptCount++; /** Tăng lượt thử để không bao giờ chạy tràn lan khi lỗi */
        this.logger.error(`Failed to process URL ${url}: ${err.message}`);
        
        let sourceDomain = 'Không rõ';
        try {
          sourceDomain = new URL(source.source_url).hostname;
        } catch (e) {
          sourceDomain = source.source_url;
        }

        let targetWpSite = source.target_site?.wp_url || 'Không rõ';
        let memberEmail = 'N/A';
        if (source.target_site?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({
            where: { id: source.target_site.owner_user_id },
            select: { email: true }
          });
          if (u) memberEmail = u.email;
        }

        /** Xác định bước lỗi cụ thể */
        let failStep = 'Xử lý luồng cào bài viết tự động';
        const extractedError = ztteam_extractErrorMessage(err);
        const em = extractedError.toLowerCase();
        if (em.includes('không thể lấy nội dung') || em.includes('fetch') || em.includes('không phải bài viết')) {
          failStep = 'Bước 1/4: Thu thập và kiểm duyệt nội dung bài viết từ website nguồn';
        } else if (em.includes('sangtao') || em.includes('ảnh gốc') || em.includes('credit')) {
          failStep = 'Bước 2/4: Tải ảnh gốc dự phòng hoặc tạo ảnh AI 2K';
        } else if (em.includes('wordpress') || em.includes('featured media') || em.includes('tải ảnh lên wp')) {
          failStep = 'Bước 3/4: Đăng bài viết & Featured Media lên Website WordPress đích';
        } else if (em.includes('fanpage') || em.includes('facebook')) {
          failStep = 'Bước 4/4: Chuẩn bị nội dung bài đăng Fanpage Facebook';
        }

        const alertText = this.telegramService.ztteam_formatAlert({
          systemName: `Auto-Crawler (${sourceDomain})`,
          targetSite: targetWpSite,
          sourceUrl: url,
          step: failStep,
          rawError: extractedError,
          nextAction: 'Hệ thống đã tự động lưu lại và sẽ thử lại ở chu kỳ tiếp theo (sau 5 phút).',
          memberEmail,
        });

        this.telegramService.ztteam_sendMessage(alertText).catch(() => {});
        
        try {
          await this.prisma.ztteam_crawl_history.upsert({
            where: { source_id_url: { source_id: source.id, url } },
            create: { source_id: source.id, url, status: 'FAILED' },
            update: { status: 'FAILED' }
          });
        } catch (e) {
          /** Ignore upsert error */
        }

        /** Circuit breaker: Nếu lỗi xác thực WordPress hoặc lỗi hệ thống nghiêm trọng, ngắt ngay vòng lặp */
        const isAuthOrForbidden = err.message?.toLowerCase().includes('forbidden') || 
                                 err.message?.toLowerCase().includes('401') || 
                                 err.message?.toLowerCase().includes('unauthorized') ||
                                 err.message?.toLowerCase().includes('status is forbidden');
        if (isAuthOrForbidden) {
          this.logger.error(`Circuit breaker triggered: WordPress auth error. Aborting remaining URLs to protect API quota.`);
          break;
        }
      }
    }
  }

  /** Update SYNC_CHECK record to mark the last time we checked this source */
  private async ztteam_markSourceSyncTime(sourceId: string): Promise<void> {
    try {
      const syncUrl = 'SYNC_CHECK';
      await this.prisma.ztteam_crawl_history.deleteMany({
        where: { source_id: sourceId, url: syncUrl }
      });
      await this.prisma.ztteam_crawl_history.create({
        data: { source_id: sourceId, url: syncUrl, status: 'SYNC' }
      });
    } catch (e: any) {
      this.logger.warn(`Could not update SYNC_CHECK for source ${sourceId}: ${e.message}`);
    }
  }
}
