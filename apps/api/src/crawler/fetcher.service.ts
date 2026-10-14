import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import * as fs from 'fs';
import * as path from 'path';
import { ztteam_getSourceOriginalsPath } from '../common/ztteam_storage.util';

export interface ZTTeamFetchResult {
  title: string;
  image: string | null;
  images?: string[];
  content: string;
  contentHtml: string;
  excerpt: string;
  siteName: string | null;
  url: string;
}

@Injectable()
export class ZTTeamFetcherService {
  private readonly logger = new Logger(ZTTeamFetcherService.name);

  async ztteam_fetchHtml(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000), /** 15 seconds timeout */
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return response.text();
    } catch (error: any) {
      this.logger.error(`Failed to fetch HTML from ${url}`, error.stack);
      throw new HttpException(`Cannot fetch URL: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  private ztteam_extractOgImage($: any): string | null {
    return (
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      null
    );
  }

  private ztteam_extractSiteName($: any): string | null {
    return $('meta[property="og:site_name"]').attr("content") || null;
  }
  
  private ztteam_extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * ZTTeam: Kiểm tra thông minh URL có phải là bài viết đơn lẻ (Single Story Article) thực sự hay không.
   * Loại trừ hoàn toàn: Trang chủ, chuyên mục (/c/, /category/), thẻ tag, tác giả, phân trang, feed, và các trang tĩnh.
   */
  ztteam_isArticleUrl(candidateUrl: string, baseDomain: string): boolean {
    try {
      const u = new URL(candidateUrl);
      
      /** 1. Bắt buộc cùng hostname hoặc là subdomain của baseDomain */
      const candHost = u.hostname.toLowerCase();
      const baseHost = baseDomain.toLowerCase();
      if (candHost !== baseHost && !candHost.endsWith(`.${baseHost}`)) {
        return false;
      }

      let path = u.pathname.trim();
      if (!path || path === '/' || path === '') {
        return false;
      }

      /** Chuẩn hóa: loại bỏ trailing slash */
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
      const pathLower = normalizedPath.toLowerCase();

      /** 2. Danh sách đen tiền tố và thành phần URL không phải bài viết */
      const nonArticleKeywords = [
        '/category/',
        '/categories/',
        '/c/',
        '/cat/',
        '/chuyen-muc/',
        '/danh-muc/',
        '/the-loai/',
        '/tag/',
        '/tags/',
        '/the/',
        '/topic/',
        '/topics/',
        '/label/',
        '/keyword/',
        '/sections/',
        '/section/',
        '/author/',
        '/tac-gia/',
        '/user/',
        '/profile/',
        '/members/',
        '/page/',
        '/p/',
        '/feed',
        '/rss',
        '/atom',
        '/archive',
        '/archives/',
        '/search',
        '/all/',
        '/about',
        '/contact',
        '/privacy',
        '/terms',
        '/disclaimer',
        '/policy',
        '/dmca',
        '/sitemap',
        '/faq',
        '/advertise',
        '/advertising',
        '/quang-cao',
        '/lien-he',
        '/gioi-thieu',
        '/wp-admin',
        '/wp-login',
        '/wp-content',
        '/wp-includes',
        '/admin',
        '/login',
        '/register',
        '/signup',
        '/cart',
        '/checkout',
        '/my-account'
      ];

      for (const keyword of nonArticleKeywords) {
        if (pathLower.includes(keyword) || pathLower.endsWith(keyword.replace(/\/$/, ''))) {
          return false;
        }
      }

      /** 3. Loại trừ các file tĩnh / media */
      const staticExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
        '.mp4', '.mp3', '.webm', '.avi', '.mov',
        '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
        '.css', '.js', '.json', '.xml'
      ];
      for (const ext of staticExtensions) {
        if (pathLower.endsWith(ext)) {
          return false;
        }
      }

      /** 4. Phân tích các phân đoạn (segments) của đường dẫn */
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length === 0) {
        return false;
      }

      const lastSegment = segments[segments.length - 1];

      /** Loại trừ các slug đơn lẻ phổ biến của chuyên mục / landing page */
      const genericSingleSlugs = new Set([
        'news', 'stories', 'story', 'popular', 'trending', 'latest', 'life', 'lifestyle',
        'health', 'tech', 'technology', 'business', 'viral', 'featured', 'home', 'posts',
        'blog', 'articles', 'article', 'tin-tuc', 'trang-chu', 'chuyen-muc', 'su-kien'
      ]);
      if (genericSingleSlugs.has(lastSegment.toLowerCase())) {
        return false;
      }

      /** 5. Quy luật hình thái học của slug bài viết (Slug Morphology) */
      /** Mẫu A: Dạng date permalink: /2026/10/slug hoặc /2026/10/11/slug */
      const dateMatch = pathLower.match(/^\/\d{4}\/\d{2}(?:\/\d{2})?\/([a-z0-9\-]+)$/);
      if (dateMatch && dateMatch[1] && dateMatch[1].length >= 5) {
        return true;
      }

      /** Mẫu B: Post ID dạng số (ví dụ: WordPress permalink /12345/ hoặc /p/12345) */
      const numericIdMatch = lastSegment.match(/^\d{3,8}$/);
      if (numericIdMatch) {
        return true;
      }

      /** Mẫu C: Slug chữ chuẩn (có dấu gạch ngang '-') */
      const hyphenCount = (lastSegment.match(/-/g) || []).length;
      /** Một tiêu đề bài viết thông thường có ít nhất 2 dấu gạch nối (>= 3 từ) và dài >= 12 ký tự */
      if (hyphenCount >= 2 && lastSegment.length >= 12) {
        return true;
      }

      /** Mẫu D: Đuôi .html với slug có gạch ngang */
      if (lastSegment.endsWith('.html') || lastSegment.endsWith('.htm')) {
        const baseSlug = lastSegment.replace(/\.html?$/, '');
        if (baseSlug.includes('-') && baseSlug.length >= 8) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * ZTTeam: Kiểm duyệt chất lượng nội dung bài viết câu chuyện trước khi xuất bản.
   * Đảm bảo không phải trang chuyên mục (như "News"), trang 404/Cloudflare, hoặc nội dung quá ngắn.
   */
  ztteam_validateStoryArticle(title: string, content: string): { isValid: boolean; reason?: string } {
    const trimmedTitle = (title || '').trim();
    const trimmedContent = (content || '').trim();

    /** 1. Kiểm tra tiêu đề */
    if (!trimmedTitle || trimmedTitle.length < 10) {
      return { isValid: false, reason: `Tiêu đề quá ngắn (${trimmedTitle.length} ký tự)` };
    }

    const titleWords = trimmedTitle.split(/\s+/).filter(Boolean);
    if (titleWords.length < 3) {
      return { isValid: false, reason: `Tiêu đề có quá ít từ (${titleWords.length} từ), có khả năng là chuyên mục hoặc từ khóa đơn lẻ` };
    }

    const titleLower = trimmedTitle.toLowerCase();
    const genericTitles = [
      'news',
      'home',
      'tin tức',
      'trang chủ',
      'category',
      'categories',
      'archives',
      'archive',
      'chuyên mục',
      'danh mục',
      'search results',
      '404 not found',
      'access denied',
      'attention required',
      'just a moment',
      'about us',
      'contact us',
      'privacy policy',
      'terms of service',
      'stories',
      'popular',
      'latest stories',
      'uncategorized'
    ];

    for (const generic of genericTitles) {
      if (titleLower === generic || titleLower === `${generic} - stories` || titleLower === `${generic} | stories`) {
        return { isValid: false, reason: `Tiêu đề "${trimmedTitle}" trùng với từ khóa chuyên mục/hệ thống` };
      }
    }

    /** 2. Kiểm tra độ dài nội dung */
    if (trimmedContent.length < 250) {
      return { isValid: false, reason: `Nội dung quá ngắn (${trimmedContent.length} ký tự < 250 ký tự tiêu chuẩn)` };
    }

    /** 3. Kiểm tra số câu hoàn chỉnh */
    const sentenceCount = (trimmedContent.match(/[.!?](\s+|$)/g) || []).length;
    if (sentenceCount < 2) {
      return { isValid: false, reason: `Nội dung không đủ câu hoàn chỉnh (${sentenceCount} câu < 2)` };
    }

    return { isValid: true };
  }


  private ztteam_parseReadability(
    html: string,
    url: string,
  ): {
    title: string;
    content: string;
    contentHtml: string;
    excerpt: string;
  } {
    const { document } = parseHTML(html);
    /** Ignore read-only baseURI error by using Object.defineProperty */
    Object.defineProperty(document, 'baseURI', { value: url, writable: true });
    
    /** @ts-ignore - Readability types can be tricky */
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      throw new Error("Không thể parse nội dung bài viết");
    }

    return {
      title: article.title || "",
      content:
        article.textContent
          ?.replace(/\t/g, " ")
          .replace(/[ ]{2,}/g, " ")
          .replace(/\. ([A-Z])/g, ".\n\n$1")
          .replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2")
          .trim() || "",
      contentHtml: article.content || "",
      excerpt: article.excerpt || "",
    };
  }

  /**
   * Fallback bypass fetcher for geo-blocked, Cloudflare-protected, or anti-bot websites
   * Uses global proxy gateway (Jina Reader) located in US/EU to retrieve full story text & images
   */
  async ztteam_fetchViaBypassProxy(url: string): Promise<ZTTeamFetchResult> {
    this.logger.log(`Attempting bypass proxy fetch for geo-blocked/protected URL: ${url}`);
    const proxyUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Proxy bypass failed with status: ${response.status}`);
    }

    const rawBody = await response.text();
    let text = rawBody;
    let title = '';
    let featuredImage: string | null = null;
    const images: string[] = [];

    try {
      const json = JSON.parse(rawBody);
      const data = json?.data || json;
      if (data && typeof data === 'object') {
        title = data.title || '';
        text = data.content || rawBody;
        const meta = data.metadata || {};
        featuredImage = meta['og:image'] || meta['twitter:image'] || data.image || null;
        if (featuredImage) {
          images.push(featuredImage);
        }
      }
    } catch (e) {
      /** Fallback nếu Jina trả về text plain thay vì JSON */
      const lines = rawBody.split('\n');
      for (const line of lines) {
        if (line.startsWith('Title:')) {
          title = line.replace('Title:', '').trim();
          break;
        }
      }
    }

    const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    let m;
    while ((m = imgRegex.exec(text)) !== null) {
      if (!images.includes(m[1])) {
        images.push(m[1]);
      }
    }

    /** Clean markdown headers, audio player artifacts (00:00), ad text, and image markdown from text */
    const cleanContent = this.ztteam_cleanStoryContent(text);
    const finalTitle = title || this.ztteam_extractDomain(url);

    /** ZTTeam Gatekeeper: Kiểm duyệt nội dung từ proxy trước khi trả về */
    const validation = this.ztteam_validateStoryArticle(finalTitle, cleanContent);
    if (!validation.isValid) {
      throw new HttpException(`Không phải bài viết hợp lệ (${validation.reason})`, HttpStatus.BAD_REQUEST);
    }

    return {
      title: finalTitle,
      image: featuredImage || images[0] || null,
      images: [...new Set(images)],
      content: cleanContent,
      contentHtml: cleanContent,
      excerpt: cleanContent.substring(0, 200),
      siteName: this.ztteam_extractDomain(url),
      url,
    };
  }

  /**
   * Clean story text: ensure 100% of main narrative is kept, while removing all ads,
   * audio player strings, timestamps, social sharing buttons, viral engagement callouts,
   * navigation links, and disclaimer blocks.
   */
  ztteam_cleanStoryContent(rawText: string): string {
    let text = rawText
      .replace(/^Title:.*?\n/m, '')
      .replace(/^URL Source:.*?\n/m, '')
      .replace(/^Markdown Content:\n/m, '')
      .replace(/div\[data-widget-id.*?\}\s*/gs, '')
      .replace(/\(function\(w,q\)[\s\S]*?\(window,["']_mgq["']\);?/g, '')
      .replace(/\{[^{}]*min-height:[^{}]*\}/g, '')
      .replace(/(?:00:00\s*)+/g, '')
      .replace(/(?:\b0?\d:\d{2}\s*)+/g, '') /** Strip loose timestamps like 0:00 */
      .replace(/!\[.*?\]\([^\s\)]+\)/g, '') /** Remove markdown images */
      /** Remove author box, breadcrumbs, reading time, and date patterns */
      .replace(/^(?:Stories|Home|thieponline)\s*$/gim, '')
      .replace(/^(?:Senior Correspondent|Staff Writer|Editor|Author|Contributor)\s*$/gim, '')
      .replace(/^\d+\s+min read\s*$/gim, '')
      .replace(/^\d+\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\s*$/gim, '')
      /** Remove ad blocks, sponsored phrases, and cookie notices */
      .replace(/\[?(?:Advertisement|Sponsored Content|Promoted Stories|Related Stories|Share on Facebook|Share on Twitter|Pin it|Leave a Reply|Leave a comment|Cookie Policy|Accept Cookies)\]?/gi, '')
      /** Remove standalone social button words */
      .replace(/^(?:Facebook|Twitter|LinkedIn|Like|Comment|Share|Follow)\s*$/gim, '')
      /** Remove audio player strings */
      .replace(/(?:Audio Player|Listen to this story|Play audio|Pause audio)/gi, '')
      /** Remove viral engagement spam callouts */
      .replace(/(?:The story is still unfolding[^\n]*|Type\s*["“']?YES["”']?[^\n]*|Comment\s*["“']?YES["”']?[^\n]*|Drop a\s*["“']?YES["”']?[^\n]*|Follow for part\s*\d+[^\n]*|Like and follow for part\s*\d+[^\n]*)/gi, '')
      /** Remove disclaimer at the very end if present */
      .replace(/Disclaimer:\s*This story is fictional[\s\S]*$/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  }

  /**
   * Extract the opening Part 1 / Hook of the story for the Facebook Fanpage post.
   * Takes the first section (e.g. up to Part 2 or ~200-300 words) ending cleanly at a sentence.
   */
  ztteam_extractPart1Hook(content: string, maxChars: number = 1000): string {
    if (!content) return '';

    /** If the story is explicitly marked with Part 1 and Part 2 */
    const part2Match = content.match(/Part\s*2\s*[:\-]/i);
    if (part2Match && part2Match.index && part2Match.index > 100) {
      let part1 = content.substring(0, part2Match.index).trim();
      /** Remove the Part 1: heading from beginning if present */
      part1 = part1.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();
      if (part1.length <= 1500) {
        return part1;
      }
    }

    /** Otherwise take the first few paragraphs up to maxChars, ending at a sentence boundary */
    let trimmed = content.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();
    if (trimmed.length <= maxChars) {
      return trimmed;
    }

    const slice = trimmed.substring(0, maxChars);
    const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
    if (lastPeriod > 200) {
      return slice.substring(0, lastPeriod + 1).trim();
    }

    return slice.trim() + '...';
  }

  /**
   * Extract Part 1 (Hook for Caption) and Part 2 (Continuation for First Comment)
   * Tách câu chuyện thành 2 phần: Part 1 cho caption bài đăng và Part 2 cho bình luận lồng nhau.
   */
  ztteam_extractStoryParts(
    content: string,
    maxPart1Chars: number = 900,
    maxPart2Chars: number = 700
  ): { part1: string; part2: string } {
    if (!content) return { part1: '', part2: '' };

    let cleaned = content.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();

    /** 1. Trường hợp bài viết có đánh dấu Part 1 và Part 2 rõ ràng */
    const part2Regex = /Part\s*2\s*[:\-]/i;
    const part2Match = cleaned.match(part2Regex);

    if (part2Match && part2Match.index && part2Match.index > 100) {
      let part1 = cleaned.substring(0, part2Match.index).trim();
      let remainder = cleaned.substring(part2Match.index).trim();

      /** Loại bỏ tiêu đề Part 2: ở đầu đoạn */
      remainder = remainder.replace(/^Part\s*2\s*[:\-]\s*/i, '').trim();

      /** Kiểm tra nếu có Part 3 để không lấy tràn sang Part 3 */
      const part3Match = remainder.match(/Part\s*3\s*[:\-]/i);
      let part2Raw = part3Match && part3Match.index ? remainder.substring(0, part3Match.index).trim() : remainder;

      /** Giới hạn Part 2 vừa đủ dài theo quy chuẩn Facebook, kết thúc trọn vẹn tại dấu câu */
      let part2 = part2Raw;
      if (part2.length > maxPart2Chars) {
        const slice = part2.substring(0, maxPart2Chars);
        const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPeriod > 150) {
          part2 = slice.substring(0, lastPeriod + 1).trim();
        } else {
          part2 = slice.trim() + '...';
        }
      }

      return { part1, part2 };
    }

    /** 2. Trường hợp câu chuyện liền mạch không có chữ Part 1, Part 2 */
    let part1 = cleaned;
    let remainder = '';

    if (cleaned.length > maxPart1Chars) {
      const slice = cleaned.substring(0, maxPart1Chars);
      const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
      if (lastPeriod > 200) {
        part1 = slice.substring(0, lastPeriod + 1).trim();
        remainder = cleaned.substring(lastPeriod + 1).trim();
      } else {
        part1 = slice.trim();
        remainder = cleaned.substring(maxPart1Chars).trim();
      }
    }

    let part2 = '';
    if (remainder) {
      if (remainder.length > maxPart2Chars) {
        const slice = remainder.substring(0, maxPart2Chars);
        const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPeriod > 150) {
          part2 = slice.substring(0, lastPeriod + 1).trim();
        } else {
          part2 = slice.trim() + '...';
        }
      } else {
        part2 = remainder;
      }
    }

    return { part1, part2 };
  }

  async ztteam_fetchUrlData(url: string): Promise<ZTTeamFetchResult> {
    try {
      /** Basic validation */
      new URL(url);
    } catch {
      throw new HttpException("URL không hợp lệ", HttpStatus.BAD_REQUEST);
    }

    try {
      const html = await this.ztteam_fetchHtml(url);

      /** Check if Cloudflare anti-bot page returned */
      if (
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('cf-wrapper') ||
        html.includes('Sorry, you have been blocked')
      ) {
        this.logger.warn(`Cloudflare block detected on ${url}. Switching to bypass proxy...`);
        return await this.ztteam_fetchViaBypassProxy(url);
      }

      const $ = cheerio.load(html);

      const image = this.ztteam_extractOgImage($);
      const siteName = this.ztteam_extractSiteName($);
      let { title, content, contentHtml, excerpt } = this.ztteam_parseReadability(
        html,
        url,
      );

      const customContentEl = $('.article-content').length ? $('.article-content') : ($('.entry-content').length ? $('.entry-content') : null);
      if (customContentEl) {
        const clone = customContentEl.clone();
        clone.find('script, style, noscript, iframe, svg, nav, header, footer, .sharedaddy, .ads, [data-widget-id], .comment-respond, .post-meta, .entry-meta, .author-box, .breadcrumbs, .social-share').remove();
        content = clone.text().replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\. ([A-Z])/g, '.\n\n$1').trim();
      }
      content = this.ztteam_cleanStoryContent(content);

      let images: string[] = [];
      const content$ = cheerio.load(contentHtml);
      content$('img').each((_, el) => {
        const src = content$(el).attr('src') || content$(el).attr('data-src');
        if (src && src.startsWith('http')) {
          images.push(src);
        }
      });

      if (image) {
        const getBaseImg = (u: string) => {
          try {
            const urlObj = new URL(u);
            return urlObj.origin + urlObj.pathname.replace(/-\d+x\d+(?=\.[a-zA-Z0-9]+$)/, '');
          } catch(e) { return u; }
        };
        const baseOg = getBaseImg(image);
        images = images.filter(img => getBaseImg(img) !== baseOg);
      }

      /** ZTTeam Gatekeeper: Kiểm duyệt chất lượng tiêu đề và nội dung */
      const validation = this.ztteam_validateStoryArticle(title, content);
      if (!validation.isValid) {
        throw new HttpException(`Không phải bài viết hợp lệ (${validation.reason})`, HttpStatus.BAD_REQUEST);
      }

      return {
        title,
        image,
        images: [...new Set(images)],
        content,
        contentHtml,
        excerpt,
        siteName: siteName || this.ztteam_extractDomain(url),
        url,
      };
    } catch (directErr: any) {
      /** Nếu lỗi xuất phát từ việc vi phạm tiêu chuẩn bài viết (trang chuyên mục/rác), ném lỗi luôn, không gọi proxy */
      if (
        directErr instanceof HttpException &&
        directErr.getStatus() === HttpStatus.BAD_REQUEST &&
        directErr.message?.includes('Không phải bài viết hợp lệ')
      ) {
        throw directErr;
      }

      this.logger.warn(`Direct fetch failed for ${url} (${directErr.message}). Automatically switching to bypass proxy...`);
      return await this.ztteam_fetchViaBypassProxy(url);
    }
  }

  /**
   * Extract article links from a category or archive URL via Jina Proxy
   * when the source website is protected by Cloudflare or blocks Vietnam IPs.
   */
  async ztteam_extractArticleLinksViaProxy(categoryUrl: string): Promise<string[]> {
    this.logger.log(`Extracting article links via bypass proxy for category: ${categoryUrl}`);
    try {
      const proxyUrl = `https://r.jina.ai/${categoryUrl}`;
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        throw new Error(`Proxy category fetch failed with status: ${response.status}`);
      }

      const text = await response.text();
      const baseDomain = this.ztteam_extractDomain(categoryUrl);
      const articleUrls = new Set<string>();

      /** Find all candidate URLs in markdown parentheses (supports both [title](url) and nested [![img](img_url) title](article_url)) */
      const urlRegex = /\((https?:\/\/[^\s\)]+)\)/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const linkHref = match[1];
        try {
          if (this.ztteam_isArticleUrl(linkHref, baseDomain)) {
            articleUrls.add(linkHref);
          }
        } catch (e) {
          /** Ignore invalid URLs */
        }
      }

      const results = Array.from(articleUrls);
      this.logger.log(`Found ${results.length} article links via bypass proxy on ${categoryUrl}`);
      return results;
    } catch (e: any) {
      this.logger.error(`Failed to extract article links via proxy: ${e.message}`);
      return [];
    }
  }

  /**
   * ZTTeam: Tải và lưu trữ ảnh gốc từ website nguồn vào ổ cứng VPS làm dự phòng an toàn
   */
  async ztteam_downloadAndSaveSourceImage(imageUrl: string, storyTitle: string): Promise<{ localPath: string; storageUrl: string }> {
    try {
      const storageDir = ztteam_getSourceOriginalsPath();
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      /** Xác định đuôi mở rộng của file ảnh */
      let ext = 'jpg';
      try {
        const u = new URL(imageUrl);
        const p = u.pathname.toLowerCase();
        if (p.endsWith('.png')) ext = 'png';
        else if (p.endsWith('.webp')) ext = 'webp';
        else if (p.endsWith('.jpeg')) ext = 'jpeg';
      } catch (e) {
        /** Mặc định là jpg */
      }

      const filename = `source_img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
      const localPath = path.join(storageDir, filename);

      this.logger.log(`Downloading source original image for "${storyTitle}": ${imageUrl}`);

      let response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Direct image download returned status ${response.status}. Retrying via proxy wsrv.nl...`);
        const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}`;
        response = await fetch(proxyUrl, {
          signal: AbortSignal.timeout(25000),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} when downloading image`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error('Downloaded image file is too small or corrupted (< 1KB)');
      }

      fs.writeFileSync(localPath, buffer);

      const storageUrl = `/storage/images/source-originals/${filename}`;
      this.logger.log(`Successfully saved source original image: ${storageUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);

      return {
        localPath,
        storageUrl,
      };
    } catch (err: any) {
      this.logger.error(`Failed to download and save source original image from ${imageUrl}: ${err.message}`);
      throw err;
    }
  }
}

