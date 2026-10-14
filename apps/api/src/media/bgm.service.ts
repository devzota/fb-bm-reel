import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ztteam_getBgmPath } from '../common/ztteam_storage.util';

export interface ZTTeamBgmItem {
  id: string;
  filename: string;
  name: string;
  url: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
}

@Injectable()
export class ZTTeamBgmService {
  private readonly logger = new Logger('ZTTeamBgmService');

  /**
   * ZTTeam: Lấy danh sách tất cả file âm thanh trong thư viện BGM
   */
  async ztteam_getBgmList(): Promise<ZTTeamBgmItem[]> {
    const bgmDir = ztteam_getBgmPath();
    if (!fs.existsSync(bgmDir)) {
      fs.mkdirSync(bgmDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(bgmDir);
    const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.ogg'];

    const items: ZTTeamBgmItem[] = [];

    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!audioExts.includes(ext)) continue;

      const fullPath = path.join(bgmDir, filename);
      try {
        const stat = fs.statSync(fullPath);
        const nameWithoutExt = path.basename(filename, ext).replace(/[_-]/g, ' ');
        const formattedName = nameWithoutExt
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        items.push({
          id: filename,
          filename,
          name: formattedName,
          url: `/storage/bgm/${filename}`,
          size_bytes: stat.size,
          size_formatted: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
          created_at: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
        });
      } catch (e) {
        /** Bỏ qua nếu lỗi đọc file */
      }
    }

    /** Ưu tiên kiss_of_spring.mp3 lên đầu nếu có */
    items.sort((a, b) => {
      if (a.filename === 'kiss_of_spring.mp3') return -1;
      if (b.filename === 'kiss_of_spring.mp3') return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  /**
   * ZTTeam: Tải file âm thanh mới lên thư viện BGM
   */
  async ztteam_saveBgmFile(file: any): Promise<ZTTeamBgmItem> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file âm thanh để tải lên');
    }

    const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.ogg'];
    const originalExt = path.extname(file.originalname).toLowerCase();

    if (!audioExts.includes(originalExt)) {
      throw new BadRequestException(`Định dạng file không hỗ trợ: ${originalExt}. Chỉ chấp nhận MP3, M4A, WAV, AAC.`);
    }

    const bgmDir = ztteam_getBgmPath();
    if (!fs.existsSync(bgmDir)) {
      fs.mkdirSync(bgmDir, { recursive: true });
    }

    /** Chuẩn hóa tên file an toàn */
    const baseName = path.basename(file.originalname, originalExt)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);

    const safeFilename = `${baseName}_${Date.now()}${originalExt}`;
    const targetPath = path.join(bgmDir, safeFilename);

    fs.copyFileSync(file.path, targetPath);

    /** Xóa file tạm của multer */
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      /** Bỏ qua */
    }

    const stat = fs.statSync(targetPath);
    this.logger.log(`Uploaded BGM file: ${safeFilename} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      id: safeFilename,
      filename: safeFilename,
      name: baseName.replace(/_/g, ' '),
      url: `/storage/bgm/${safeFilename}`,
      size_bytes: stat.size,
      size_formatted: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * ZTTeam: Xóa file âm thanh khỏi thư viện BGM
   */
  async ztteam_deleteBgmFile(filename: string): Promise<boolean> {
    const bgmDir = ztteam_getBgmPath();
    const targetPath = path.join(bgmDir, path.basename(filename));

    if (!fs.existsSync(targetPath)) {
      throw new NotFoundException(`Không tìm thấy file âm thanh: ${filename}`);
    }

    fs.unlinkSync(targetPath);
    this.logger.log(`Deleted BGM file: ${filename}`);
    return true;
  }

  /**
   * ZTTeam: Lấy đường dẫn file BGM tuyệt đối để render video
   */
  ztteam_resolveBgmPath(preferredFilename?: string | null): string {
    const bgmDir = ztteam_getBgmPath();

    /** 1. Nếu có file chỉ định và tồn tại */
    if (preferredFilename) {
      const p = path.join(bgmDir, path.basename(preferredFilename));
      if (fs.existsSync(p)) return p;
    }

    /** 2. Mặc định ưu tiên kiss_of_spring.mp3 */
    const kissSpring = path.join(bgmDir, 'kiss_of_spring.mp3');
    if (fs.existsSync(kissSpring)) return kissSpring;

    /** 3. Lấy ngẫu nhiên file có trong thư mục */
    if (fs.existsSync(bgmDir)) {
      const files = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav'));
      if (files.length > 0) {
        const rand = files[Math.floor(Math.random() * files.length)];
        return path.join(bgmDir, rand);
      }
    }

    /** 4. Fallback về assets/bgm nếu storage chưa có */
    const assetKiss = path.join(process.cwd(), 'assets', 'bgm', 'kiss_of_spring.mp3');
    if (fs.existsSync(assetKiss)) return assetKiss;

    throw new Error('Không tìm thấy bản nhạc nền BGM nào trong hệ thống');
  }
}
