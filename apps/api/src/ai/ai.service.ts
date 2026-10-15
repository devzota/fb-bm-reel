import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { PrismaService } from '../prisma/prisma.service';

/**
 * ZTTeamAIService — Provider adapter for AI text generation.
 * Currently supports OpenAI GPT. Expandable to Claude/Gemini via env config.
 */
@Injectable()
export class ZTTeamAIService {
  private readonly logger = new Logger('ZTTeamAIService');

  constructor(private readonly prisma: PrismaService) { }

  private async getSettings() {
    const records = await this.prisma.ztteam_settings.findMany({
      where: {
        key: {
          in: [
            'active_ai_provider',
            'openai_api_key',
            'deepseek_api_key',
            'gemini_api_key',
          ]
        }
      }
    });
    const settings: Record<string, string> = {};
    records.forEach(r => settings[r.key] = r.value);

    return {
      activeProvider: settings['active_ai_provider'] || 'openai',
      openaiKey: settings['openai_api_key'] || process.env.OPENAI_API_KEY,
      deepseekKey: settings['deepseek_api_key'] || process.env.DEEPSEEK_API_KEY,
      geminiKey: settings['gemini_api_key'] || process.env.GEMINI_API_KEY,
    };
  }

  /**
   * Generate a simple short caption for YouTube videos
   */
  async ztteam_generateShortCaption(promptText: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning default caption');
      return 'Awesome short video!';
    }
    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(promptText);
        const response = await result.response;
        return response.text().trim();
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'user', content: promptText }
          ],
          max_tokens: 300,
          temperature: 0.8,
        });

        return response.choices[0]?.message?.content?.trim() || 'Awesome short video!';
      }
    } catch (e: any) {
      this.logger.error(`Error generating short caption: ${e.message}`);
      return 'Awesome short video!';
    }
  }

  /**
   * Generate a short reel script (~15 seconds) from a WordPress post.
   * @param postContent - The article text content
   * @param tone - Writing tone (professional, humorous, dramatic, etc.)
   * @param maxWords - Target word count for the script
   * @returns The generated script text
   */
  async ztteam_generateScript(
    postContent: string,
    tone: string = 'professional',
    maxWords: number = 60,
    customPrompt?: string | null,
  ): Promise<{ caption: string; hook: string; sub_voice: string }> {
    this.logger.log(`Generating reel script (tone: ${tone}, maxWords: ${maxWords})`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning mock script');
      const mockScript = await this.ztteam_getMockScript(postContent);
      return { caption: 'Mock Caption', hook: 'Mock Hook', sub_voice: mockScript };
    }

    const defaultSystemPrompt = `Bạn là chuyên gia viết kịch bản video ngắn (Reel) cho mạng xã hội.
Viết kịch bản giọng đọc cho video ~15 giây dựa trên bài viết người dùng cung cấp.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- CHỈ VIẾT ĐÚNG ${maxWords} TỪ HOẶC ÍT HƠN. KHÔNG ĐƯỢC VƯỢT QUÁ SỐ TỪ NÀY.
- Giọng văn: ${tone}
- Ngôn ngữ: Tự động viết bằng đúng ngôn ngữ của bài viết gốc (Nếu bài viết bằng tiếng Anh thì viết kịch bản bằng tiếng Anh, nếu bài viết bằng tiếng Việt thì viết kịch bản bằng tiếng Việt).
- Phải có hook mạnh ở câu đầu (gây tò mò)
- Kết thúc bằng CTA ngắn gọn
- KHÔNG dùng emoji, hashtag, hay kí tự đặc biệt trong kịch bản giọng đọc`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

BẮT BUỘC TRẢ VỀ DẠNG KẾT QUẢ ĐÚNG THEO ĐỊNH DẠNG JSON SAU (KHÔNG KÈM THEO BẤT KỲ VĂN BẢN NGOÀI NÀO):
{
  "caption": "Trạng thái bài đăng mạng xã hội (kèm hashtag nếu phù hợp)",
  "hook": "Tiêu đề ngắn gây chú ý hiển thị trên video",
  "sub_voice": "Kịch bản đọc voiceover hoàn chỉnh"
}`;

    const userContent = `Generate Reel content from the following article:\n\n${postContent.substring(0, 2000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
            maxOutputTokens: Math.max(2000, Math.round(maxWords * 8)),
          }
        });

        const result = await model.generateContent(`${promptWithRules}\n\n${userContent}`);
        const text = result.response.text();
        const jsonResult = this.ztteam_safeParseJson(text);
        return {
          caption: jsonResult.caption || '',
          hook: jsonResult.hook || '',
          sub_voice: jsonResult.sub_voice || ''
        };
      } else {
        /** Fallback or explicit choice for OpenAI / Deepseek */
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: Math.max(2000, Math.round(maxWords * 8)),
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = this.ztteam_safeParseJson(resultString);

        this.logger.log(`Script generated: Hook="${result.hook}"`);
        return {
          caption: result.caption || '',
          hook: result.hook || '',
          sub_voice: result.sub_voice || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI script generation failed: ${error.message}`);
      throw new Error('Lỗi tạo kịch bản AI: ' + error.message);
    }
  }

  /**
   * Safe JSON Parser & Repair Helper
   * Cleans markdown blocks, repairs unclosed quotes/braces, and extracts fields via Regex fallback if JSON is truncated
   */
  private ztteam_safeParseJson(rawText: string): any {
    if (!rawText || !rawText.trim()) return {};

    /** 1. Strip markdown code fences if present */
    let cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    /** 2. Attempt standard JSON.parse */
    try {
      return JSON.parse(cleanText);
    } catch (e1) {
      this.logger.warn(`Initial JSON parse failed: ${(e1 as Error).message}. Attempting repair...`);
    }

    /** 3. Attempt to repair truncated JSON (append closing quote and brace if cut off) */
    const repairAttempts = [
      cleanText + '"}' ,
      cleanText + '}' ,
      cleanText + '"}]' ,
      cleanText + '}]' ,
    ];

    for (const attempt of repairAttempts) {
      try {
        return JSON.parse(attempt);
      } catch (e2) {
        /** continue trying */
      }
    }

    /** 4. Regex fallback extraction for caption, hook, sub_voice, comment */
    this.logger.warn('JSON repair failed. Using regex extraction fallback...');
    const result: Record<string, string> = {};

    const captionMatch = cleanText.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (captionMatch && captionMatch[1]) {
      result.caption = captionMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const hookMatch = cleanText.match(/"hook"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (hookMatch && hookMatch[1]) {
      result.hook = hookMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const voiceMatch = cleanText.match(/"sub_voice"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (voiceMatch && voiceMatch[1]) {
      result.sub_voice = voiceMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const commentMatch = cleanText.match(/"comment"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (commentMatch && commentMatch[1]) {
      result.comment = commentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    return result;
  }

  /**
   * Generate an AI caption and first comment for an image post based on a WordPress article.
   */
  async ztteam_generateImageContent(
    postContent: string,
    tone: string = 'professional',
    customPrompt?: string | null,
  ): Promise<{ caption: string; comment: string }> {
    this.logger.log(`Generating image content (tone: ${tone})`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning mock image content');
      return { caption: 'Mock Caption', comment: 'Mock Comment' };
    }

    const defaultSystemPrompt = `Bạn là chuyên gia viết bài đăng (Post) kèm hình ảnh cho Fanpage mạng xã hội.
Viết một nội dung bài đăng thật thu hút dựa trên bài viết người dùng cung cấp.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- Giọng văn: ${tone}
- Ngôn ngữ: Tự động viết bằng đúng ngôn ngữ của bài viết gốc (Nếu bài viết bằng tiếng Anh thì viết kịch bản bằng tiếng Anh, nếu bài viết bằng tiếng Việt thì viết kịch bản bằng tiếng Việt).
- Viết 1 tiêu đề (caption) hấp dẫn, ngắn gọn, súc tích, chia đoạn rõ ràng.
- Viết 1 bình luận (comment) để ghim dưới bài viết nhằm kêu gọi tương tác (call to action).
- CÓ THỂ dùng emoji phù hợp.`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

BẮT BUỘC TRẢ VỀ DẠNG KẾT QUẢ ĐÚNG THEO ĐỊNH DẠNG JSON SAU (KHÔNG KÈM THEO BẤT KỲ VĂN BẢN NGOÀI NÀO):
{
  "caption": "Nội dung bài đăng kèm ảnh",
  "comment": "Bình luận kêu gọi tương tác để ghim dưới bài viết"
}`;

    const userContent = `Generate Facebook image post content from the following article:\n\n${postContent.substring(0, 2000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
            maxOutputTokens: 2000,
          }
        });

        const result = await model.generateContent(`${promptWithRules}\n\n${userContent}`);
        const text = result.response.text();
        const jsonResult = this.ztteam_safeParseJson(text);
        return {
          caption: jsonResult.caption || '',
          comment: jsonResult.comment || ''
        };
      } else {
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: 2000,
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = this.ztteam_safeParseJson(resultString);

        return {
          caption: result.caption || '',
          comment: result.comment || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI image content generation failed: ${error.message}`);
      throw new Error('Lỗi tạo content AI: ' + error.message);
    }
  }

  /**
   * Generate subtitles with precise timing synchronization.
   * Uses smart chunking (breaks on punctuation like commas and periods)
   * and calculates sentence durations using speech pause weights to match natural TTS audio timing.
   * @param script - Full text script
   * @param audioDuration - Total audio duration in seconds
   * @returns Array of subtitle entries with start, end, and text
   */
  ztteam_generateSubtitles(
    script: string,
    audioDuration: number,
  ): Array<{ start: number; end: number; text: string }> {
    /** Clean text and split into words */
    const cleanedScript = script.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleanedScript.split(' ').filter(w => w.length > 0);
    
    if (words.length === 0 || audioDuration <= 0) return [];

    const sentences: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      currentChunk.push(word);
      /** Break chunk if:
       * 1. Reaches 6 words max (ideal for readable short video subtitles)
       * 2. Ends with comma/semicolon/colon when chunk has >= 3 words
       * 3. Ends with period/question/exclamation mark
       */
      const isSentenceEnd = /[.!?。]$/.test(word);
      const isClauseEnd = /[,;:，；:]$/.test(word) && currentChunk.length >= 3;
      const isMaxWords = currentChunk.length >= 6;

      if (isSentenceEnd || isClauseEnd || isMaxWords) {
        sentences.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      sentences.push(currentChunk.join(' '));
    }

    if (sentences.length === 0) return [];

    /** 
     * Calculate speech weight for each sentence chunk:
     * - Base weight: 0.28s per word
     * - Character weight: 0.04s per character
     * - Comma/Clause pause weight: +0.35s
     * - Sentence end pause weight: +0.55s
     */
    const weights = sentences.map(text => {
      const wordCount = text.split(/\s+/).length;
      const charCount = text.length;
      const hasPause = /[,;:，；:]$/.test(text);
      const hasStop = /[.!?。]$/.test(text);

      let weight = (wordCount * 0.28) + (charCount * 0.04);
      if (hasPause) weight += 0.35;
      if (hasStop) weight += 0.55;

      return Math.max(0.6, weight);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let currentTime = 0;
    
    return sentences.map((text, i) => {
      const sentenceDuration = (weights[i] / totalWeight) * audioDuration;
      
      const start = Math.round(currentTime * 100) / 100;
      const end = Math.round((currentTime + sentenceDuration) * 100) / 100;
      
      currentTime = end;
      
      return { start, end, text: text.trim() };
    });
  }

  /**
   * Generate an ASS subtitle file content from subtitle data.
   * ASS format is used because FFmpeg renders it beautifully with custom fonts/colors.
   */
  ztteam_generateASSContent(
    subtitles: Array<{ start: number; end: number; text: string }>,
    videoY: number = 0,
    videoHeight: number = 1920,
    hookText?: string,
    subtitlesY?: number
  ): string {
    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const cs = Math.round((seconds % 1) * 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    /** Position subtitle based on subtitlesY or inside the video frame */
    const bottomOfVideo = videoY + videoHeight;
    /** For Alignment=8 (Top Center), MarginV is from the top! */
    const marginV = subtitlesY !== undefined ? subtitlesY : (bottomOfVideo + 40);
    const topMarginV = Math.max(120, videoY + 120);

    let ass = `[Script Info]
Title: ZTReel Subtitles
ScriptType: v4.00+
WrapStyle: 1
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat Black,60,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,2,8,40,40,${marginV},1
Style: Hook,Montserrat Black,70,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,3,8,40,40,${topMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    if (hookText && subtitles.length > 0) {
      /** Show hook text for the first 5 seconds or until video ends */
      const hookEnd = formatTime(Math.min(5, subtitles[subtitles.length - 1].end));
      ass += `Dialogue: 1,0:00:00.00,${hookEnd},Hook,,0,0,0,,{\\b1\\c&H00FFFF&\\3c&H000000&}${hookText}\n`;
    }

    for (const sub of subtitles) {
      const durationSec = sub.end - sub.start;
      const words = sub.text.split(' ').filter(w => w.trim().length > 0);
      if (words.length === 0) continue;

      /** Fake karaoke effect: split duration equally among words */
      const wordDurationCs = Math.round((durationSec * 100) / words.length);
      const karaokeText = words.map(w => `{\\k${wordDurationCs}}${w}`).join(' ');

      ass += `Dialogue: 0,${formatTime(sub.start)},${formatTime(sub.end)},Default,,0,0,0,,${karaokeText}\n`;
    }

    return ass;
  }

  /** Mock script for development without API key */
  private ztteam_getMockScript(postContent: string): string {
    const firstSentence = postContent.split(/[.!?]/)[0]?.trim() || 'Tin tức nóng hổi';
    return `Bạn có biết? ${firstSentence}. Đây là thông tin bạn không nên bỏ lỡ. Theo dõi ngay để cập nhật thêm!`;
  }

  /**
   * Transcribe an audio file using OpenAI Whisper (Speech to Text)
   * @param audioPath - Path to the local MP3/WAV file
   * @returns The transcribed text
   */
  async ztteam_transcribeAudio(audioPath: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey) {
      throw new Error('Bạn chưa cấu hình OpenAI API Key để dùng Whisper.');
    }

    this.logger.log(`Transcribing audio: ${audioPath}`);
    const fs = require('fs');

    try {
      const OpenAI = require('openai').default;
      const openai = new OpenAI({ apiKey: settings.openaiKey.trim() });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        language: 'vi',
        prompt: 'Đây là một video TikTok tiếng Việt. Nếu có đoạn nhạc không lời hoặc im lặng, hãy bỏ qua và không ghi gì cả.',
        temperature: 0,
      });

      let text = transcription.text.trim();

      /** Basic filter for common Whisper hallucinations on silence/music */
      const hallucinations = ['Biên lơn thắng cô hồn', 'cảm ơn các bạn', 'đăng ký kênh', 'hẹn gặp lại', 'chúc các bạn', 'Amara.org'];
      for (const h of hallucinations) {
        if (text.toLowerCase().includes(h.toLowerCase()) && text.length < 50) {
          text = '';
        }
      }

      return text;
    } catch (error: any) {
      this.logger.error(`Error transcribing audio: ${error.message}`);
      throw new Error('Lỗi chuyển đổi giọng nói thành văn bản: ' + error.message);
    }
  }

  /**
   * Rewrite an original script (e.g. from TikTok) into a new, unique script for a Reel.
   * @param originalText - The transcribed text from original video
   * @param customPrompt - Optional custom instructions
   * @returns The generated script object
   */
  async ztteam_rewriteTikTokScript(
    originalText: string,
    customPrompt?: string | null,
  ): Promise<{ caption: string; hook: string; sub_voice: string }> {
    this.logger.log(`Rewriting TikTok script`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      throw new Error('Chưa cấu hình API Key (OpenAI/Gemini/Deepseek) để viết lại kịch bản.');
    }

    const defaultSystemPrompt = `Bạn là chuyên gia Reup nội dung Video ngắn (Reel/TikTok) chuyên nghiệp.
Dưới đây là nội dung bóc băng từ một video TikTok của người khác. Nhiệm vụ của bạn là VIẾT LẠI (Rephrase) kịch bản này để làm một video mới.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- BÁM SÁT NỘI DUNG GỐC: Bạn PHẢI giữ nguyên ý nghĩa cốt lõi của bản gốc.
- NGẮN GỌN & GIẬT GÂN: Kịch bản mới phải mang hơi hướng kịch tính, giật gân, gây sốc nhẹ hoặc tò mò tột độ. Viết thật ngắn gọn, súc tích (khoảng 80 - 120 từ).
- CHỈ THAY ĐỔI CÂU TỪ: Hãy diễn đạt lại bằng từ đồng nghĩa, tuyệt đối không trùng lặp từ ngữ với bản gốc (để lách bản quyền).
- Hook (Câu đầu tiên) phải cực kỳ giật gân và thu hút.
- BẮT BUỘC Ở CUỐI VIDEO: Bạn phải thêm chính xác câu này vào cuối kịch bản: "Liên hệ với chúng tôi qua Zalo 0919901493 hoặc gọi trực tiếp để được hỗ trợ nhanh hơn".
- KHÔNG dùng emoji, hashtag, hay kí tự đặc biệt trong kịch bản giọng đọc (sub_voice).`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

IMPORTANT: YOU MUST ALWAYS RETURN THE RESULT IN VIETNAMESE.
YOU MUST RETURN EXACTLY ONE JSON OBJECT WITH THE FOLLOWING STRUCTURE:
{
  "caption": "A catchy social media caption (with hashtags)",
  "hook": "A short, engaging text hook to display on the video",
  "sub_voice": "The spoken script for the voiceover. BẮT BUỘC PHẢI KẾT THÚC BẰNG CÂU LIÊN HỆ ZALO 0919901493."
}`;

    const userContent = `Original Script:\n\n${originalText.substring(0, 3000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
            maxOutputTokens: 500,
          }
        });

        const result = await model.generateContent(`${promptWithRules}\n\n${userContent}`);
        const text = result.response.text();
        const jsonResult = JSON.parse(text || '{}');
        return {
          caption: jsonResult.caption || '',
          hook: jsonResult.hook || '',
          sub_voice: jsonResult.sub_voice || ''
        };
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: 500,
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = JSON.parse(resultString);

        return {
          caption: result.caption || '',
          hook: result.hook || '',
          sub_voice: result.sub_voice || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI rewrite failed: ${error.message}`);
      throw new Error('Lỗi khi AI viết lại kịch bản: ' + error.message);
    }
  }

  /**
   * ZTTeam: Viết lại kịch bản câu chuyện cho Muse.ai khi bị từ chối
   * Dựa chính xác vào thông báo từ chối của Muse để khắc phục vi phạm,
   * bám sát nội dung gốc nhất có thể, nhưng chuyển sang phong cách điện ảnh an toàn 100%.
   */
  async ztteam_rewriteSafeStoryForMuse(originalContent: string, museFeedback: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.geminiKey) {
      throw new Error('Chưa cấu hình API Key AI (OpenAI hoặc Gemini).');
    }

    const systemPrompt = `You are an elite Hollywood script doctor and video prompt specialist for Muse.ai.
A video generation request on Muse.ai was STRICTLY REJECTED with this message from Muse's safety filter:
"${museFeedback}"

Your mission is to rewrite the story into an engaging, dramatic 15-second cinematic teaser (3-4 sentences in English) that is 100% COMPLIANT with Muse's policy.

CRITICAL RULES:
1. ADAPT MUSE'S SUGGESTION:
   - Carefully read Muse's feedback: "${museFeedback}". If Muse suggested a safe alternative direction (e.g. starting a new life, emotional departure, uncovering a secret without mentioning divorce or papers), YOU MUST FULLY EMBRACE AND FOLLOW THAT DIRECTION.
2. ABSOLUTELY FORBIDDEN WORDS (DO NOT USE ANY OF THESE WORDS OR VARIATIONS):
   - NO: "backup", "backup husband", "backup spouse", "divorce", "divorced", "divorcing", "affair", "cheating", "ex", "ex-husband", "ex-wife", "mistress", "wife", "husband"
   - NO: "signed a document", "sign a document", "agreement", "papers", "contract", "lawsuit", "sue", "court", "defamation"
   - NO: "blood", "kill", "murder", "gun", "weapon", "crime", "dead", "corpse", "violence"
3. HOW TO CONVERT THE CONFLICT SAFELY:
   - Keep the main character's name (e.g. Matthew), the dramatic tension, the departure/flight to Australia, the clever plan, and the unexpected twist.
   - Frame the conflict as a dramatic personal parting of ways, a betrayal of trust, or a new beginning after heartbreak — NEVER mention marriage dissolution, backup husbands, or signing papers.
4. FORMAT: Output ONLY the 3-4 sentence English story ready for video generation narration. No quotes, no intro, no explanation.`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 350,
          },
        });
        const result = await model.generateContent(`${systemPrompt}\n\nORIGINAL STORY:\n"""\n${originalContent}\n"""`);
        const text = result.response.text();
        return (text || '').trim();
      } else {
        const OpenAI = require('openai').default;
        const apiKey = (settings.openaiKey || '').trim();
        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `ORIGINAL STORY:\n"""\n${originalContent}\n"""` },
          ],
          max_tokens: 350,
          temperature: 0.7,
        });

        return response.choices[0]?.message?.content?.trim() || originalContent;
      }
    } catch (e: any) {
      this.logger.error(`Error rewriting safe story for Muse: ${e.message}`);
      throw new Error(`Lỗi khi AI viết lại kịch bản an toàn: ${e.message}`);
    }
  }

  /**
   * ZTTeam: Tạo kịch bản Hook 3 đoạn cho Video Reel từ bài viết gốc
   * Bám sát 100% cốt truyện thực tế của bài viết, cực kỳ kịch tính, lôi cuốn
   * Tự động highlight từ khóa cảm xúc bằng thẻ <span class="hl">...</span>
   */
  async ztteam_generateReelHookStory(
    title: string,
    content: string,
  ): Promise<{ hookHtml: string; plainText: string; paragraphs: string[] }> {
    const cleanTitle = (title || '').replace(/<[^>]*>?/gm, '').trim();
    const cleanContent = (content || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

    const systemPrompt = `You are a master viral Facebook Reel copywriter.
Based strictly on the provided real story:
Title: "${cleanTitle}"
Story Details:
"${cleanContent.substring(0, 3000)}"

Task:
Write a viral, high-suspense 3-paragraph Hook in ENGLISH for a 10-second Facebook Reel.

CRITICAL REQUIREMENTS:
1. TRUTHFUL TO ORIGINAL STORY: Every fact must be based strictly on the provided story details. Do NOT make up fake, irrelevant names or events.
2. EXACTLY 3 DISTINCT PARAGRAPHS:
   - Paragraph 1: An electrifying, curiosity-inducing opening hook based on the core event.
   - Paragraph 2: The climax, shocking twist, or intense confrontation from the story.
   - Paragraph 3: A compelling cliffhanger question or tease that makes the viewer desperate to read the full story in the comments.
3. KEYWORD HIGHLIGHTS: In each paragraph, wrap 1 to 2 key phrases in <span class="hl">...</span> (e.g. <span class="hl">DNA test</span>, <span class="hl">secret room</span>).
4. TOTAL LENGTH: Keep between 65 to 85 words total across all 3 paragraphs. (Do NOT exceed 95 words so text fits elegantly on screen).
5. FORMAT OUTPUT: Return strictly 3 paragraphs separated by double line breaks. No titles, no numbering (like 1., 2.), no quotes, no markdown headers.`;

    try {
      const settings = await this.getSettings();
      let rawResponse = '';

      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 300,
          },
        });
        const result = await model.generateContent(systemPrompt);
        rawResponse = result.response.text();
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (apiKey) {
          const openai = new OpenAI({ apiKey, baseURL });
          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'user', content: systemPrompt },
            ],
            max_tokens: 300,
            temperature: 0.75,
          });
          rawResponse = response.choices[0]?.message?.content || '';
        }
      }

      if (rawResponse && rawResponse.trim().length > 30) {
        const paragraphs = rawResponse
          .trim()
          .split(/\n\s*\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0);

        if (paragraphs.length >= 2) {
          const finalParagraphs = paragraphs.slice(0, 3);
          const hookHtml = finalParagraphs.map(p => `<p>${p}</p>`).join('\n');
          const plainText = finalParagraphs.join('\n\n').replace(/<[^>]*>?/gm, '');
          return { hookHtml, plainText, paragraphs: finalParagraphs };
        }
      }

      throw new Error(`AI không thể tạo đủ 3 đoạn kịch bản hook đạt chuẩn chất lượng (Kết quả trả về quá ngắn hoặc không đúng định dạng).`);
    } catch (err: any) {
      this.logger.error(`AI hook generation failed: ${err.message}`);
      throw new Error(`Lỗi AI tạo Hook kịch tính: ${err.message}`);
    }
  }

  /**
   * ZTTeam: Sáng tạo prompt mỹ thuật chuyên nghiệp cho Avatar (1:1) và Cover (16:9) dựa trên Tên Page, Website nguồn và các bài viết gần nhất
   */
  async ztteam_generateBrandingPrompts(params: {
    pageName: string;
    category?: string | null;
    siteUrl?: string | null;
    tags?: string[];
    recentTitles?: string[];
  }): Promise<{ avatarPrompt: string; coverPrompt: string }> {
    const { pageName, category, siteUrl, tags, recentTitles } = params;
    const settings = await this.getSettings();

    const systemPrompt = `You are a world-class creative brand director and AI art prompt engineer specializing in Facebook Page visual identities.
Your task is to analyze a Facebook Page's name, connected website/source, niche tags, and recent article titles to generate TWO cohesive, high-aesthetic image generation prompts for an AI image generator (ChatGPT Image / DALL-E style).

RULES FOR AVATAR PROMPT (Square 1:1, Logo / Emblem / Mascot):
- Must be a visually iconic, modern 3D emblem, stylized mascot, or minimalist vector-style logo suitable for a circular/square profile picture.
- Centered composition, clean solid or subtle gradient background with high contrast.
- NO text, NO letters, NO words, NO typos inside the image (AI text can look distorted).
- High visual impact, vibrant colors, premium lighting (soft ambient occlusion, 8k render style).
- English prompt only, under 60 words.

RULES FOR COVER PROMPT (Landscape 16:9, Banner / Scene):
- Must be a wide, cinematic background illustration or 3D scene matching the theme, color palette, and mood of the avatar.
- Composition should have the main visual elements centered or on the right side (leaving room on the bottom-left where the avatar badge will sit on Facebook).
- NO text, NO slogans, NO distorted letters.
- Highly detailed, cinematic lighting, ultra-wide atmosphere.
- English prompt only, under 80 words.

OUTPUT FORMAT:
You MUST return ONLY a valid JSON object with exactly these two keys:
{
  "avatarPrompt": "English prompt for Avatar...",
  "coverPrompt": "English prompt for Cover..."
}`;

    const userPrompt = `Page Name: ${pageName}
Category: ${category || 'General'}
Connected Site: ${siteUrl || 'N/A'}
Niche Tags: ${tags && tags.length > 0 ? tags.join(', ') : 'N/A'}
Recent Content Topics / Articles:
${recentTitles && recentTitles.length > 0 ? recentTitles.map(t => `- ${t}`).join('\n') : '- General lifestyle and interesting stories'}

Generate the 2 cohesive art prompts now.`;

    try {
      let rawJson = '';
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(settings.geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        rawJson = result.response.text();
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.8,
        });
        rawJson = response.choices[0]?.message?.content || '{}';
      }

      const parsed = JSON.parse(rawJson);
      return {
        avatarPrompt: parsed.avatarPrompt || `Modern 3D emblem icon for ${pageName}, clean aesthetic, vibrant lighting, 8k render, no text`,
        coverPrompt: parsed.coverPrompt || `Cinematic wide scenic banner for ${pageName}, modern atmosphere, high detail 8k, no text`,
      };
    } catch (err: any) {
      this.logger.error(`Error generating branding prompts: ${err.message}`);
      return {
        avatarPrompt: `Modern 3D iconic emblem representing ${pageName}, minimalist clean design, vibrant lighting, smooth render, no text`,
        coverPrompt: `Cinematic wide atmosphere wallpaper representing ${pageName}, matching aesthetics, cinematic lighting, 8k, no text`,
      };
    }
  }
}
