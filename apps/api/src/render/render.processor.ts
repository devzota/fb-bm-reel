import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamAIService } from '../ai/ai.service';
import { TelegramService } from '../telegram/telegram.service';
import { ZTTeamTTSService } from '../audio/tts.service';
import { ZTTeamFFmpegService } from '../media/ffmpeg.service';
import { ZTTeamPuppeteerService } from '../media/puppeteer.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ztteam_getReelsPath, ztteam_getStorageRoot } from '../common/ztteam_storage.util';

/** Type for the render job payload */
interface ZTTeamRenderJobData {
  reelId: string;
  pageId: string;
  wpPostId: string;
  wpPostTitle: string;
  templateId: string;
}

/**
 * ZTTeamRenderProcessor — BullMQ worker that processes reel rendering jobs.
 * Implements the 6-step pipeline: Fetch → AI Script → TTS → Image Prep → Overlay → FFmpeg Merge
 */
@Injectable()
export class ZTTeamRenderProcessor implements OnModuleInit {
  private readonly logger = new Logger(ZTTeamRenderProcessor.name);
  private queue: Queue;
  private worker: Worker;
  private connection: IORedis;

  /** Storage root for rendered reels */
  private readonly storageRoot = ztteam_getReelsPath();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: ZTTeamAIService,
    private readonly ttsService: ZTTeamTTSService,
    private readonly puppeteerService: ZTTeamPuppeteerService,
    private readonly ffmpegService: ZTTeamFFmpegService,
    private readonly eventEmitter: EventEmitter2,
    private readonly telegramService: TelegramService,
  ) { }

  onModuleInit() {
    /** Initialize Redis connection for BullMQ */
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    this.connection = new IORedis(redisPort, redisHost, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('ztteam-render', { connection: this.connection });

    /** Create worker with concurrency limit */
    this.worker = new Worker(
      'ztteam-render',
      async (job: Job<ZTTeamRenderJobData>) => {
        return this.ztteam_processRenderJob(job);
      },
      {
        connection: this.connection,
        concurrency: parseInt(process.env.RENDER_CONCURRENCY || '1', 10),
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Render worker initialized and listening for jobs');
  }

  /**
   * Add a new render job to the queue.
   * Creates a reel record in DB first, then enqueues.
   */
  async ztteam_addJob(data: ZTTeamRenderJobData): Promise<string> {
    const job = await this.queue.add('render-reel', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    this.logger.log(`Job enqueued: ${job.id} for reel ${data.reelId}`);
    return job.id || '';
  }

  /**
   * Main render pipeline — 6 steps.
   */
  private async ztteam_processRenderJob(job: Job<ZTTeamRenderJobData>): Promise<void> {
    const { reelId, pageId, wpPostId, templateId } = job.data;
    this.logger.log(`===== START RENDER: reel=${reelId} =====`);

    /** Update status to RENDERING */
    await this.ztteam_updateReel(reelId, { status: 'RENDERING', progress: 0 });

    /** Fetch reel to get original wp_post_url */
    const reelRecord = await this.prisma.ztteam_reels.findUnique({
      where: { id: reelId }
    });

    /** Create working directory */
    const workDir = path.join(this.storageRoot, reelId);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      /** ========== YOUTUBE BRANCH ========== */
      if (reelRecord?.source_type === 'YOUTUBE') {
        await this.ztteam_processYoutubeRenderJob(reelId, pageId, wpPostId, templateId, workDir, reelRecord);
        return;
      }

      /** ========== STEP 1: Fetch data ========== */
      await this.ztteam_updateReel(reelId, { progress: 5 });
      const { page, template, post } = await this.ztteam_step1_fetchData(pageId, wpPostId, templateId);

      /** ========== STEP 2: AI Script + TTS ========== */
      await this.ztteam_updateReel(reelId, { progress: 15 });
      const { script, caption, hook, audioPath, audioDuration, subtitles } = await this.ztteam_step2_aiAndAudio(
        post.content,
        page.ai_tone,
        page.ai_caption_length === 'short' ? 40 : page.ai_caption_length === 'long' ? 80 : 60,
        template.voice_id || 'alloy',
        workDir,
        page.ai_custom_prompt,
        page.voice_speed || 1.0,
        reelRecord
      );

      let finalCaption = caption;

      await this.ztteam_updateReel(reelId, { ai_script: script, ai_caption: finalCaption, ai_hook: hook, progress: 35 });

      /** ========== STEP 3: Prepare images ========== */
      await this.ztteam_updateReel(reelId, { progress: 45 });
      const videoX = (template.layout as any)?.video?.x ?? 0;
      const videoW = (template.layout as any)?.video?.w ?? 1080;
      const videoH = (template.layout as any)?.video?.h ?? 1080;
      const videoY = template.video_y ?? 0;
      const preparedImages = await this.ztteam_step3_prepareImages(post.images, workDir, videoW, videoH, videoX, videoY);

      /** ========== STEP 4: Puppeteer overlay ========== */
      await this.ztteam_updateReel(reelId, { progress: 55 });
      const { overlayPath, bgImagePath } = await this.ztteam_step4_renderOverlay(template, page, hook || post.title, workDir);

      /** ========== STEP 5: Merge with FFmpeg ========== */
      await this.ztteam_updateReel(reelId, { progress: 65 });
      const subtitlesY = (template.layout as any)?.subtitles?.y;
      const { videoPath, thumbnailPath } = await this.ztteam_step5_render(
        preparedImages,
        audioPath,
        overlayPath,
        subtitles,
        audioDuration,
        videoX,
        videoY,
        videoW,
        videoH,
        workDir,
        subtitlesY,
        bgImagePath
      );
      await this.ztteam_updateReel(reelId, { progress: 90 });

      /** ========== STEP 6: Save result ========== */
      const videoUrl = `/storage/reels/${reelId}/output.mp4`;
      const thumbnailUrl = `/storage/reels/${reelId}/thumbnail.jpg`;

      /** Save meta.json to preserve reel metadata permanently on disk */
      try {
        const metaPath = path.join(workDir, 'meta.json');
        fs.writeFileSync(metaPath, JSON.stringify({
          reelId,
          pageId: page.id,
          pageName: page.name,
          wpPostId,
          wpPostTitle: post.title,
          wpPostUrl: (post as any).url || (post as any).link || '',
          templateId: template.id,
          aiScript: script,
          aiCaption: finalCaption,
          aiHook: hook,
          created_at: new Date().toISOString(),
        }, null, 2));
      } catch (e: any) {
        this.logger.warn(`Could not save meta.json: ${e.message}`);
      }

      await this.ztteam_updateReel(reelId, {
        status: 'COMPLETED',
        progress: 100,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        audio_url: `/storage/reels/${reelId}/voice.mp3`,
        subtitle_data: subtitles,
      });

      this.logger.log(`===== RENDER COMPLETE: reel=${reelId} =====`);

    } catch (error: any) {
      this.logger.error(`Render failed for reel ${reelId}: ${error.message}`);
      await this.ztteam_updateReel(reelId, {
        status: 'FAILED',
        error_log: error.message || 'Unknown error',
      });

      let pageName = 'Không rõ';
      let memberEmail = 'N/A';
      if (reelRecord && reelRecord.page_id) {
        const p = await this.prisma.ztteam_pages.findUnique({
          where: { id: reelRecord.page_id },
          include: { fb_account: true }
        });
        if (p) {
          pageName = p.name;
          if (p.fb_account?.owner_user_id) {
            const u = await this.prisma.ztteam_users.findUnique({
              where: { id: p.fb_account.owner_user_id },
              select: { email: true }
            });
            if (u) memberEmail = u.email;
          }
        }
      }

      const alertMsg = this.telegramService.ztteam_formatAlert({
        systemName: 'Render Video AI Muse (Remotion)',
        fanpageName: pageName,
        postTitle: reelRecord?.wp_post_title || 'Video Reel',
        step: 'Render video đa khung hình bằng AI Muse / Remotion engine',
        rawError: error.message,
        nextAction: 'Đã cập nhật trạng thái FAILED. Hệ thống sẽ tiếp tục xử lý các video khác.',
        memberEmail,
      });
      this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});

      throw error;
    }
  }

  private async ztteam_processYoutubeRenderJob(reelId: string, pageId: string, wpPostId: string, templateId: string, workDir: string, reelRecord: any): Promise<void> {
    this.logger.log(`===== START YOUTUBE RENDER: reel=${reelId} =====`);

    await this.ztteam_updateReel(reelId, { status: 'RENDERING', progress: 5 });

    try {
      const page = await this.prisma.ztteam_pages.findUnique({
        where: { id: pageId },
        include: { youtube_settings: true }
      });
      if (!page) throw new Error('Page not found');

      const originalTitle = reelRecord.wp_post_title || 'Video YouTube';
      const ytUrl = reelRecord.wp_post_url;

      if (!ytUrl) throw new Error('Missing YouTube URL in wp_post_url');

      /** Step 1: Dùng yt-dlp tải video */
      await this.ztteam_updateReel(reelId, { progress: 20 });
      const rawVideoPath = path.join(workDir, 'raw.mp4');
      const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

      const { promisify } = require('util');
      const exec = promisify(require('child_process').exec);

      const { ztteam_getStorageRoot } = require('../common/ztteam_storage.util');
      const cookiesFile = path.join(ztteam_getStorageRoot(), 'cookies.txt');
      const hasCookies = fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 10;
      const cookieFlag = hasCookies ? `--cookies "${cookiesFile}"` : '';
      const clientArgs = hasCookies ? '' : `--extractor-args "youtube:player_client=tv_embedded,android_vr"`;

      const ytdlpArgs = `${cookieFlag} ${clientArgs} --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --no-warnings`;
      
      /** Tải video (ưu tiên mp4/m4a, linh hoạt fallback để không bao giờ bị Requested format is not available) */
      await exec(`yt-dlp ${ytdlpArgs} --merge-output-format mp4 -f "bv*+ba/b/18/best" -o "${rawVideoPath}" "${ytUrl}"`);

      /** Kiểm tra file rawVideoPath. Nếu yt-dlp lưu dưới dạng raw.webm, raw.mkv hay raw.mp4.webm ➔ Tự động đổi tên sang raw.mp4 */
      if (!fs.existsSync(rawVideoPath)) {
        const filesInDir = fs.readdirSync(workDir);
        const downloadedVideo = filesInDir.find(f => (f.startsWith('raw') || f.includes('raw')) && !f.endsWith('.json') && !f.endsWith('.png') && !f.endsWith('.jpg') && !f.endsWith('.txt') && !f.endsWith('.ttf') && !f.endsWith('.mp3'));
        if (downloadedVideo) {
          const actualPath = path.join(workDir, downloadedVideo);
          this.logger.log(`[render.processor] yt-dlp lưu file dạng ${downloadedVideo}, đang đổi tên thành raw.mp4...`);
          fs.renameSync(actualPath, rawVideoPath);
        }
      }

      if (!fs.existsSync(rawVideoPath)) {
        throw new Error(`Không tìm thấy file video raw.mp4 sau khi gọi yt-dlp. Vui lòng kiểm tra lại link YouTube hoặc Cookies.`);
      }

      /** Tải thumbnail */
      await exec(`yt-dlp ${ytdlpArgs} --write-thumbnail --skip-download -o "${path.join(workDir, 'raw_thumb')}" "${ytUrl}"`).catch(() => { });

      /** Chuyển thumbnail sang jpg nếu cần, hoặc dùng hình mặc định */
      if (fs.existsSync(path.join(workDir, 'raw_thumb.webp'))) {
        await sharp(path.join(workDir, 'raw_thumb.webp')).jpeg().toFile(thumbnailPath);
      } else if (fs.existsSync(path.join(workDir, 'raw_thumb.jpg'))) {
        fs.copyFileSync(path.join(workDir, 'raw_thumb.jpg'), thumbnailPath);
      } else {
        /** Fallback thumbnail đen */
        await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 0, g: 0, b: 0 } } })
          .jpeg()
          .toFile(thumbnailPath);
      }

      /** Step 2: Dùng AI sinh Caption từ Title và Description gốc */
      await this.ztteam_updateReel(reelId, { progress: 50 });
      let aiCaption = '';
      try {
        const originalDescription = reelRecord.ai_script || '';
        const prompt = `Viết một trạng thái (caption) Facebook hấp dẫn, ngắn gọn cho video.\n` +
          `Tiêu đề gốc: "${originalTitle}".\n` +
          `Mô tả gốc: "${originalDescription.substring(0, 1000)}".\n` +
          `Giọng điệu: ${page.ai_tone || 'hấp dẫn'}.\n` +
          `Sử dụng hashtag phù hợp.\n${page.ai_custom_prompt || ''}\nIMPORTANT: YOU MUST ALWAYS RETURN THE RESULT IN ENGLISH.`;
        aiCaption = await this.aiService.ztteam_generateShortCaption(prompt);
      } catch (err: any) {
        this.logger.warn(`AI Caption failed: ${err.message}`);
        aiCaption = `Enjoy this amazing short! #shorts\n\nOriginal: ${originalTitle}`;
      }

      await this.ztteam_updateReel(reelId, { ai_caption: aiCaption, progress: 60 });

      /** Step 3: Dùng FFmpeg xử lý chống bản quyền (tuỳ chỉnh settings) */
      await this.ztteam_updateReel(reelId, { progress: 70 });
      const outputPath = path.join(workDir, 'output.mp4');

      const ytSettings = page.youtube_settings;
      const watermark = ytSettings?.add_watermark ? ytSettings.watermark_text : null;
      const addFrame = ytSettings?.add_frame || false;

      /** Xử lý FFmpeg: Tốc độ luôn 1.05x để lách bản quyền cơ bản */

      /** Kiểm tra xem video có audio hay không */
      const hasAudio = await exec(`ffprobe -i "${rawVideoPath}" -show_streams -select_streams a -loglevel error`).then((res: any) => res.stdout.trim().length > 0).catch(() => false);

      /** Sinh màu Gradient ngẫu nhiên nổi bật (Loại bỏ màu đen và tối) */
      const colors = ['#FF416C', '#FF4B2B', '#8E2DE2', '#4A00E0', '#f12711', '#f5af19', '#fc4a1a', '#f7b733', '#11998e', '#38ef7d'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      /** Dùng sharp tạo 1 file gradient PNG Kép (Trên và Dưới) để FFmpeg overlay */
      const gradientSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs>
        <linearGradient id="gradTop" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${randomColor};stop-opacity:0.95" />
          <stop offset="25%" style="stop-color:${randomColor};stop-opacity:0" />
        </linearGradient>
        <linearGradient id="gradBottom" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="60%" style="stop-color:${randomColor};stop-opacity:0" />
          <stop offset="85%" style="stop-color:${randomColor};stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:${randomColor};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#gradTop)" />
      <rect width="1080" height="1920" fill="url(#gradBottom)" />
      </svg>`;
      const gradPngPath = path.join(workDir, 'gradient.png');
      await sharp(Buffer.from(gradientSvg)).png().toFile(gradPngPath);

      /** 
       * Tối ưu bộ lọc FFmpeg: Cinematic Blur Background (mượt hơn) + Smart Crop + Dual Gradient
       */
      let filterComplex = `[0:v]setpts=PTS/1.05,scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:8,scale=1080:1920,eq=brightness=-0.1:saturation=0.6[bg];` +
        `[0:v]setpts=PTS/1.05,scale=1134:2016:force_original_aspect_ratio=decrease,crop=iw/1.05:ih/1.05,eq=saturation=1.15:contrast=1.05[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];` +
        `[v1][1:v]overlay=0:0[v2]`;

      if (hasAudio) {
        filterComplex += `;[0:a]atempo=1.05[a]`;
      }

      /** Xử lý Font và Text để chèn Title (Word Wrap an toàn) */
      /** Lọc bỏ 100% Emoji và các ký tự vô hình/đặc biệt gây lỗi ô vuông, chỉ giữ lại chữ, số và Tiếng Việt */
      const safeTitle = (originalTitle || 'Video AI')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E\u00C0-\u024F\u1E00-\u1EFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const wrapText = (text: string, maxChars: number) => {
        const words = text.split(' ');
        let line = '';
        let lines = [];
        for (let w of words) {
          if (line.length + w.length + 1 <= maxChars) {
            line += (line.length ? ' ' : '') + w;
          } else {
            lines.push(line);
            line = w;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      /** Số ký tự 35 để chữ dàn ra vừa đủ sát viền (padding khoảng 15px) */
      const linesArray = wrapText(safeTitle, 35);
      const fontPath = 'storage/Roboto-Medium.ttf';
      let currentFilter = 'v2';

      /** Chèn từng dòng chữ để tránh việc FFmpeg render ký tự xuống dòng \n thành ô vuông */
      for (let i = 0; i < linesArray.length; i++) {
        const lineText = linesArray[i];
        const titleTxtPath = path.join(workDir, `title_${i}.txt`);
        fs.writeFileSync(titleTxtPath, '\uFEFF' + lineText, 'utf8');

        const relTitleTxtPath = `storage/reels/${reelId}/title_${i}.txt`;
        const yPos = `h-320+(${i}*70)`; /** Kéo chữ xuống thấp hơn để nằm trọn trong vùng màu tối của Gradient */
        const nextFilter = i === linesArray.length - 1 ? (watermark ? 'v3' : 'v_out') : `v_line_${i}`;

        filterComplex += `;[${currentFilter}]drawtext=fontfile='${fontPath}':textfile='${relTitleTxtPath}':fontcolor=white:fontsize=55:shadowcolor=black@0.8:shadowx=3:shadowy=3:x=(w-text_w)/2:y=${yPos}[${nextFilter}]`;
        currentFilter = nextFilter;
      }

      /** Chèn Watermark (Watermark ở góc trên cùng bên trái, padding 15px) */
      if (watermark) {
        filterComplex += `;[v3]drawtext=fontfile='${fontPath}':text='${watermark}':fontcolor=white@0.7:fontsize=35:x=15:y=15[v_out]`;
      }

      const audioMap = hasAudio ? `-map "[a]" -c:a aac -b:a 128k` : `-an`;

      /** Tối ưu tốc độ: Sử dụng preset superfast để render nhanh hơn đáng kể */
      await exec(`ffmpeg -loglevel warning -i "${rawVideoPath}" -i "${gradPngPath}" -filter_complex "${filterComplex}" -map "[v_out]" ${audioMap} -c:v libx264 -preset superfast -crf 23 "${outputPath}" -y`);

      await this.ztteam_updateReel(reelId, { progress: 95 });

      /** Save result */
      const videoUrl = `/storage/reels/${reelId}/output.mp4`;
      const thumbnailUrl = `/storage/reels/${reelId}/thumbnail.jpg`;

      await this.ztteam_updateReel(reelId, {
        status: 'COMPLETED',
        progress: 100,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
      });

      this.logger.log(`===== YOUTUBE RENDER COMPLETE: reel=${reelId} =====`);
    } catch (error: any) {
      this.logger.error(`YouTube Render failed for reel ${reelId}: ${error.message}`);
      await this.ztteam_updateReel(reelId, {
        status: 'FAILED',
        error_log: error.message || 'Unknown error',
      });
      throw error;
    }
  }

  /** Step 1: Fetch page config, template, and WordPress post data */
  private async ztteam_step1_fetchData(pageId: string, wpPostId: string, templateId: string) {
    this.logger.log('Step 1: Fetching data...');

    let page = await this.prisma.ztteam_pages.findUnique({
      where: { id: pageId },
      include: { sources: true, fb_account: true },
    });

    if (!page) {
      /** Fallback for old job payloads that used fb_page_id */
      page = await this.prisma.ztteam_pages.findFirst({
        where: { fb_page_id: pageId },
        include: { sources: true, fb_account: true },
      });
    }

    if (!page) throw new Error(`Page ${pageId} not found`);

    let finalTemplateId = templateId;
    if (!finalTemplateId || finalTemplateId === 'auto' || finalTemplateId === 'default') {
      if (page.default_reel_template_id) {
        finalTemplateId = page.default_reel_template_id;
      } else {
        const defaultTemplate = await this.prisma.ztteam_templates.findFirst({
          where: { format: 'video', is_default: true }
        });
        if (defaultTemplate) {
          finalTemplateId = defaultTemplate.id;
        } else {
          const anyVideoTemplate = await this.prisma.ztteam_templates.findFirst({
            where: { format: 'video' }
          });
          if (anyVideoTemplate) {
            finalTemplateId = anyVideoTemplate.id;
          }
        }
      }
    }

    const template = await this.prisma.ztteam_templates.findUnique({
      where: { id: finalTemplateId },
    });
    if (!template) throw new Error(`Template ${finalTemplateId} not found`);

    /** Removed reel_template_overrides logic as templates are now page-scoped */
    /** Fetch the WordPress post content and images */
    const source = page.sources[0];
    if (!source) {
      throw new Error('Fanpage chưa được cấu hình Nguồn bài viết (WordPress) nào trong phần Cài đặt.');
    }

    let post = { content: '', images: [] as string[], title: '' };

    if (source) {
      const site = await this.prisma.ztteam_target_sites.findUnique({
        where: { id: source.target_site_id },
      });

      if (site) {
        try {
          const wpUrl = site.wp_url.replace(/\/$/, '');
          const res = await axios.get(`${wpUrl}/wp-json/wp/v2/posts/${wpPostId}`, {
            timeout: 15000,
          });
          const wpPost = res.data;
          post.title = wpPost.title?.rendered || '';
          post.content = (wpPost.content?.rendered || '').replace(/<[^>]+>/g, ' ').trim();

          /** Extract images from post content */
          const imgRegex = /<img[^>]+(?:src|data-src)="([^"]+)"/gi;
          let match;
          while ((match = imgRegex.exec(wpPost.content?.rendered || '')) !== null) {
            post.images.push(match[1]);
          }

          /** Also try featured image */
          if (wpPost.featured_media) {
            try {
              const mediaRes = await axios.get(`${wpUrl}/wp-json/wp/v2/media/${wpPost.featured_media}`, { timeout: 10000 });
              if (mediaRes.data?.source_url) {
                post.images.unshift(mediaRes.data.source_url);
              }
            } catch { /** Ignore featured image errors */ }
          }
        } catch (error: any) {
          this.logger.warn(`Failed to fetch WP post: ${error.message}`);
        }
      }
    }

    /** Ensure at least 1 image, max 5 */
    if (post.images.length === 0) {
      throw new Error('Bài viết không có ảnh nào để tạo video');
    }
    post.images = post.images.slice(0, 5);

    this.logger.log(`Step 1 done: ${post.images.length} images, ${post.content.length} chars content`);
    return { page, template, post };
  }

  /** Step 2: Generate AI script, TTS audio, and subtitle timing */
  private async ztteam_step2_aiAndAudio(
    content: string,
    tone: string,
    maxWords: number,
    voiceId: string,
    workDir: string,
    customPrompt?: string | null,
    voiceSpeed: number = 1.0,
    reelRecord?: any
  ) {
    this.logger.log('Step 2: AI script + TTS...');

    let aiResult = { sub_voice: '', caption: '', hook: '' };
    if (reelRecord && reelRecord.ai_script) {
      this.logger.log('Reusing existing AI script...');
      aiResult = {
        sub_voice: reelRecord.ai_script,
        caption: reelRecord.ai_caption || '',
        hook: reelRecord.ai_hook || ''
      };
    } else {
      aiResult = await this.aiService.ztteam_generateScript(content, tone, maxWords, customPrompt);
    }

    let audioPath = require('path').join(workDir, 'voice.mp3');
    if (require('fs').existsSync(audioPath)) {
      this.logger.log('Reusing existing voice.mp3...');
    } else {
      audioPath = await this.ttsService.ztteam_textToSpeech(aiResult.sub_voice, voiceId, workDir, voiceSpeed);
    }

    const audioDuration = this.ttsService.ztteam_getAudioDuration(audioPath);
    const subtitles = this.aiService.ztteam_generateSubtitles(aiResult.sub_voice, audioDuration);

    this.logger.log(`Step 2 done: script=${aiResult.sub_voice.length} chars, audio=${audioDuration}s, ${subtitles.length} subs`);
    return { script: aiResult.sub_voice, caption: aiResult.caption, hook: aiResult.hook, audioPath, audioDuration, subtitles };
  }

  /** Step 3: Download and prepare images for 9:16 */
  private async ztteam_step3_prepareImages(
    imageUrls: string[],
    workDir: string,
    vw: number = 1080,
    vh: number = 1920,
    vx: number = 0,
    vy: number = 0
  ): Promise<string[]> {
    this.logger.log(`Step 3: Preparing ${imageUrls.length} images for ${vw}x${vh} at ${vx},${vy}...`);

    const preparedImages: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const rawPath = path.join(workDir, `raw_${i}.jpg`);
      const prepPath = path.join(workDir, `prep_${i}.jpg`);

      try {
        /** Download image */
        const response = await axios.get(imageUrls[i], {
          responseType: 'arraybuffer',
          timeout: 15000,
        });

        /** Convert to pure JPEG using sharp to support avif, webp, etc. */
        const jpegBuffer = await sharp(response.data)
          .jpeg({ quality: 90 })
          .toBuffer();

        fs.writeFileSync(rawPath, jpegBuffer);

        /** Prepare for dimensions with blur background */
        await this.ffmpegService.ztteam_prepareImage(rawPath, prepPath, vw, vh, vx, vy);
        preparedImages.push(prepPath);
      } catch (error: any) {
        this.logger.warn(`Image ${i} failed: ${error.message}, skipping`);
      }
    }

    if (preparedImages.length === 0) {
      throw new Error('Không thể xử lý ảnh nào từ bài viết');
    }

    this.logger.log(`Step 3 done: ${preparedImages.length} images prepared`);
    return preparedImages;
  }

  private async ztteam_step4_renderOverlay(template: any, page: any, postTitle: string, workDir: string): Promise<{ overlayPath: string; bgImagePath: string }> {
    this.logger.log('Step 4: Rendering overlay...');

    /** Apply page-specific template overrides (deep merge layout) */
    const overrides = page.reel_template_overrides as any;
    if (overrides && typeof overrides === 'object') {
      template.video_y = overrides.video_y ?? template.video_y;
      template.video_radius = overrides.video_radius ?? template.video_radius;
      if (overrides.layout) {
        template.layout = {
          ...(template.layout as any || {}),
          ...overrides.layout
        };
      }
    }

    /** Merge template with page-specific overrides */
    let htmlContent = template.html_content;
    const layout = template.layout as any;
    const videoY = template.video_y ?? 0;
    const videoRadius = template.video_radius ?? 0;

    this.logger.log(`APPLYING LAYOUT: ${JSON.stringify(layout)}`);

    /** Replace Handlebars placeholders with actual values */
    const videoX = (layout as any)?.video?.x ?? 0;
    const videoW = (layout as any)?.video?.w ?? 1080;
    const videoH = (layout as any)?.video?.h ?? 1080;

    htmlContent = htmlContent.replace(/{{video_area\.x}}/g, String(videoX));
    htmlContent = htmlContent.replace(/{{video_area\.y}}/g, String(videoY));
    htmlContent = htmlContent.replace(/{{video_area\.w}}/g, String(videoW));
    htmlContent = htmlContent.replace(/{{video_area\.h}}/g, String(videoH));
    htmlContent = htmlContent.replace(/{{video_area\.radius}}/g, String(videoRadius));
    htmlContent = htmlContent.replace(/{{layout\.breaking\.x}}/g, String(layout?.breaking?.x ?? 40));
    htmlContent = htmlContent.replace(/{{layout\.breaking\.y}}/g, String(layout?.breaking?.y ?? 26));

    htmlContent = htmlContent.replace(/{{layout\.header\.x}}/g, String(layout?.header?.x ?? 84));
    htmlContent = htmlContent.replace(/{{layout\.header\.y}}/g, String(layout?.header?.y ?? 1362));

    htmlContent = htmlContent.replace(/{{layout\.hook\.x}}/g, String(layout?.hook?.x ?? 90));
    htmlContent = htmlContent.replace(/{{layout\.hook\.y}}/g, String(layout?.hook?.y ?? 1450));

    htmlContent = htmlContent.replace(/{{layout\.verdict\.x}}/g, String(layout?.verdict?.x ?? 90));
    htmlContent = htmlContent.replace(/{{layout\.verdict\.y}}/g, String(layout?.verdict?.y ?? 1700));

    let bgImageUrl = layout?.bg_image_url || '';
    let bgImagePath = '';

    if (bgImageUrl && bgImageUrl.startsWith('/storage/')) {
      const relativePath = bgImageUrl.replace(/^\/storage\//, '');
      bgImagePath = path.join(ztteam_getStorageRoot(), relativePath);
    }

    htmlContent = htmlContent.replace(/{{layout\.bg_image_url}}/g, '');
    htmlContent = htmlContent.replace(/{{#unless layout\.bg_image_url}}display:none;{{\/unless}}/g, 'display:none;');

    htmlContent = htmlContent.replace(/{{{fontFace}}}/g, '');

    const avatarHtml = page.avatar ? `<img src="${page.avatar}" style="width:100%;height:100%;object-fit:cover;" />` : '<div style="background:#ddd;width:100%;height:100%"></div>';
    htmlContent = htmlContent.replace(/{{{logoSvg}}}/g, () => avatarHtml);
    htmlContent = htmlContent.replace(/{{fanpageName}}/g, () => (page.name || 'Fanpage'));

    const headerColor = layout?.header_color;
    if (headerColor) {
      htmlContent = htmlContent.replace(/\.header\s*\.pname\s*{([^}]*?)}/g, `.header .pname { $1 color: ${headerColor} !important; }`);
    }
    const hookColor = layout?.hook_color;
    if (hookColor) {
      htmlContent = htmlContent.replace(/\.hook\s*\.line\s*{([^}]*?)}/g, `.hook .line { $1 color: ${hookColor} !important; }`);
      htmlContent = htmlContent.replace(/\.hook\s*{([^}]*?)}/g, `.hook { $1 color: ${hookColor} !important; }`);
    }

    /** Replace color conditionals */
    htmlContent = htmlContent.replace(/{{#if colors\.danger}}{{colors\.danger}}{{else}}{{colors\.primary}}{{\/if}}/g, '#ef4444');
    htmlContent = htmlContent.replace(/{{#if colors\.primary}}{{colors\.primary}}{{else}}#1877f2{{\/if}}/g, '#1877f2');

    /** Insert post title into hook */
    const displayTitle = postTitle || 'Tiêu đề bài viết nổi bật';
    const hookHtml = `<span class="line accent">${displayTitle}</span>`;
    htmlContent = htmlContent.replace(/{{#each hook}}.*?{{\/each}}/gs, () => hookHtml);
    htmlContent = htmlContent.replace(/{{title}}/g, displayTitle);

    const overlayPath = path.join(workDir, 'overlay.png');
    await this.puppeteerService.ztteam_renderOverlay(htmlContent, overlayPath);

    this.logger.log('Step 4 done: overlay rendered');
    return { overlayPath, bgImagePath };
  }

  /** Step 5: Create slideshow and merge everything with FFmpeg */
  private async ztteam_step5_render(
    images: string[],
    audioPath: string,
    overlayPath: string,
    subtitles: Array<{ start: number; end: number; text: string }>,
    audioDuration: number,
    videoX: number,
    videoY: number,
    videoW: number,
    videoH: number,
    workDir: string,
    subtitlesY?: number,
    bgImagePath?: string
  ) {
    this.logger.log('Step 5: FFmpeg rendering...');

    /** Create slideshow */
    const slideshowPath = path.join(workDir, 'slideshow.mp4');
    await this.ffmpegService.ztteam_createSlideshow(images, audioDuration, slideshowPath, videoW, videoH);

    /** Generate ASS subtitle file */
    const assContent = this.aiService.ztteam_generateASSContent(subtitles, videoY, 1080, undefined, subtitlesY);
    const subtitlePath = path.join(workDir, 'subtitles.ass');
    fs.writeFileSync(subtitlePath, assContent, 'utf-8');

    /** Final merge */
    const outputPath = path.join(workDir, 'output.mp4');
    await this.ffmpegService.ztteam_mergeAll({
      slideshowPath,
      voicePath: audioPath,
      overlayPath,
      subtitlePath,
      outputPath,
      duration: audioDuration,
      videoX,
      videoY,
      bgImagePath
    });

    /** Generate thumbnail */
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');
    await this.ffmpegService.ztteam_generateThumbnail(outputPath, thumbnailPath);

    this.logger.log('Step 5 done: video rendered');
    return { videoPath: outputPath, thumbnailPath };
  }

  /** Helper: update reel record in database */
  private async ztteam_updateReel(reelId: string, data: any): Promise<void> {
    const updated = await this.prisma.ztteam_reels.update({
      where: { id: reelId },
      data,
    });
    this.eventEmitter.emit('reel.updated', updated);
  }
}
