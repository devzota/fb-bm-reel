import { Controller, Get, Post, Delete, Param, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZTTeamBgmService } from './bgm.service';
import { ZTTeamHookVideoService } from './hook-video.service';
import * as os from 'os';
const { diskStorage } = require('multer');

@Controller('media')
export class ZTTeamMediaController {
  constructor(
    private readonly bgmService: ZTTeamBgmService,
    private readonly hookVideoService: ZTTeamHookVideoService,
  ) {}

  /**
   * ZTTeam: Lấy danh sách nhạc nền BGM trong thư viện
   * GET /api/media/bgm
   */
  @Get('bgm')
  async ztteam_getBgmList() {
    const list = await this.bgmService.ztteam_getBgmList();
    return {
      success: true,
      data: list,
    };
  }

  /**
   * ZTTeam: Tải file nhạc nền BGM mới lên hệ thống
   * POST /api/media/bgm/upload
   */
  @Post('bgm/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: os.tmpdir(),
    }),
    limits: {
      fileSize: 30 * 1024 * 1024, /** Tối đa 30MB */
    },
  }))
  async ztteam_uploadBgm(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }

    const item = await this.bgmService.ztteam_saveBgmFile(file);
    return {
      success: true,
      message: 'Tải file âm thanh lên thư viện thành công!',
      data: item,
    };
  }

  /**
   * ZTTeam: Xóa file nhạc nền BGM khỏi hệ thống
   * DELETE /api/media/bgm/:filename
   */
  @Delete('bgm/:filename')
  async ztteam_deleteBgm(@Param('filename') filename: string) {
    if (!filename) {
      throw new BadRequestException('Vui lòng chỉ định tên file âm thanh cần xóa');
    }

    await this.bgmService.ztteam_deleteBgmFile(filename);
    return {
      success: true,
      message: 'Đã xóa file âm thanh thành công!',
    };
  }

  /**
   * ZTTeam: Kích hoạt render Video Hook sắc nét từ ảnh thủ công
   * POST /api/media/hook-render/:imageId
   */
  @Post('hook-render/:imageId')
  async ztteam_triggerHookRender(
    @Param('imageId') imageId: string,
    @Body() body: {
      bgm?: string;
      forceRegenHook?: boolean;
      videoEngine?: string;
      forceRegenContent?: boolean;
      templateStyle?: 'vintage_paper' | 'parchment_gold' | 'frosted_glass';
    }
  ) {
    const result = await this.hookVideoService.ztteam_renderHookVideo(imageId, {
      bgmFilename: body?.bgm,
      forceRegenHook: body?.forceRegenHook,
      videoEngine: body?.videoEngine,
      forceRegenContent: body?.forceRegenContent,
      templateStyle: body?.templateStyle,
    });
    return result;
  }
}
