import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ztteam_sendMessage(message: string): Promise<boolean> {
    try {
      const tokenSetting = await this.prisma.ztteam_settings.findUnique({ where: { key: 'telegram_bot_token' } });
      const chatIdSetting = await this.prisma.ztteam_settings.findUnique({ where: { key: 'telegram_chat_id' } });

      const token = tokenSetting?.value;
      const chatId = chatIdSetting?.value;

      if (!token || !chatId) {
        /** Silently skip if not configured */
        return false;
      }

      await this.ztteam_executeSend(token, chatId, message);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
      return false;
    }
  }

  async ztteam_testMessage(token: string, chatId: string): Promise<boolean> {
    const message = `🔔 *Thông báo từ ZT-Reel System*\n\n✅ Kết nối Telegram thành công!\nHệ thống sẽ gửi các thông báo lỗi tự động vào nhóm/chat này.`;
    return this.ztteam_executeSend(token, chatId, message);
  }

  private async ztteam_executeSend(token: string, chatId: string, text: string): Promise<boolean> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
      await axios.post(url, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      });
      return true;
    } catch (error: any) {
      this.logger.warn(`Telegram Markdown send failed (${error.response?.data?.description || error.message}), retrying as plain text...`);
      try {
        const cleanText = text.replace(/\*/g, '');
        await axios.post(url, {
          chat_id: chatId,
          text: cleanText
        });
        return true;
      } catch (fallbackError: any) {
        this.logger.error(`Telegram API Error: ${fallbackError.response?.data?.description || fallbackError.message}`);
        throw new Error(fallbackError.response?.data?.description || 'Lỗi kết nối đến Telegram API');
      }
    }
  }

  ztteam_formatAlert(params: {
    systemName: string;
    environment?: string;
    targetSite?: string;
    sourceUrl?: string;
    fanpageName?: string;
    postTitle?: string;
    step: string;
    rawError: string;
    nextAction?: string;
    memberEmail?: string;
  }): string {
    const {
      systemName,
      environment = process.env.NODE_ENV === 'production' ? 'VPS Production' : 'Local Development',
      targetSite,
      sourceUrl,
      fanpageName,
      postTitle,
      step,
      rawError,
      nextAction = 'Hệ thống sẽ tự động thử lại ở chu kỳ tiếp theo.',
      memberEmail,
    } = params;

    const errorVi = ztteam_translateErrorVi(rawError);

    let msg = `🚨 *[LỖI HỆ THỐNG: ${systemName.toUpperCase()}]*\n\n`;
    msg += `💻 *Môi trường:* ${environment}\n`;
    if (memberEmail && memberEmail !== 'N/A') msg += `👤 *Thành viên:* ${memberEmail}\n`;
    if (targetSite) msg += `🌐 *Website Đích (WP):* ${targetSite}\n`;
    if (sourceUrl) msg += `🔗 *Link Nguồn:* ${sourceUrl}\n`;
    if (fanpageName) msg += `🚩 *Fanpage:* ${fanpageName}\n`;
    if (postTitle) msg += `📄 *Bài viết:* ${postTitle}\n`;
    msg += `📍 *Bước lỗi:* ${step}\n`;
    msg += `❌ *Nguyên nhân (Tiếng Việt):* ${errorVi}\n`;
    if (rawError && rawError !== errorVi) {
      msg += `🔍 *Mã kỹ thuật:* \`${rawError.substring(0, 150)}\`\n`;
    }
    msg += `\n🔄 *Trạng thái:* ${nextAction}`;

    return msg;
  }
}

/**
 * Chuyển đổi mã lỗi hệ thống kỹ thuật sang tiếng Việt dễ hiểu
 */
export function ztteam_translateErrorVi(errorMsg: string): string {
  if (!errorMsg) return 'Lỗi không xác định.';
  const msg = errorMsg.toLowerCase();

  /** 1. Lỗi tài khoản AI SangTao / OpenAI */
  if (msg.includes('insufficient credits') || msg.includes('402')) {
    return 'Tài khoản SangTao.ai đã hết credit (cần 4 credit để tạo ảnh 2K). Hệ thống sẽ chuyển sang dùng ảnh gốc dự phòng.';
  }
  if (msg.includes('rate limit') || msg.includes('429')) {
    return 'Vượt quá giới hạn tần suất gọi API (Rate Limit 429). Hệ thống sẽ tự động thử lại sau ít phút.';
  }

  /** 2. Lỗi mạng / Tường lửa / Cloudflare */
  if (msg.includes('403') || msg.includes('forbidden')) {
    return 'Website nguồn chặn truy cập máy chủ (HTTP 403 Forbidden / Cloudflare chống bot cào).';
  }
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('etimedout')) {
    return 'Hết thời gian chờ kết nối (Timeout). Mạng máy chủ nguồn hoặc proxy phản hồi quá chậm.';
  }
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
    return 'Không thể phân giải tên miền website nguồn (Lỗi DNS hoặc tên miền không tồn tại).';
  }

  /** 3. Lỗi WordPress API */
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('rest_forbidden') || msg.includes('rest_cannot_create')) {
    return 'Lỗi xác thực WordPress: Mật khẩu ứng dụng (Application Password) không đúng hoặc tài khoản không đủ quyền đăng bài.';
  }
  if (msg.includes('rest_invalid') || msg.includes('invalid_json')) {
    return 'Dữ liệu bài viết không hợp lệ khi gửi sang WordPress.';
  }

  /** 4. Lỗi Facebook Graph API */
  if (msg.includes('error validating access token') || msg.includes('session has expired') || msg.includes('190')) {
    return 'Token Fanpage/Facebook đã hết hạn hoặc tài khoản vừa đổi mật khẩu. Cần kết nối lại trên Web để lấy token mới.';
  }
  if (msg.includes('permissions error') || msg.includes('200')) {
    return 'Fanpage bị hạn chế quyền hoặc tài khoản quản trị bị mất quyền đăng bài.';
  }
  if (msg.includes('100') || msg.includes('invalid parameter')) {
    return 'Tham số đăng bài Facebook không hợp lệ (Ảnh/Video không đúng định dạng hoặc vượt dung lượng).';
  }

  /** 5. Lỗi xử lý Render Video / FFmpeg */
  if (msg.includes('ffmpeg') || msg.includes('spawn ffmpeg')) {
    return 'Lỗi tiến trình FFmpeg khi ghép video, nạp font chữ hoặc lồng nhạc nền.';
  }
  if (msg.includes('bgm') || msg.includes('audio file not found')) {
    return 'Không tìm thấy file nhạc nền BGM được chỉ định trong thư viện.';
  }

  return errorMsg;
}
