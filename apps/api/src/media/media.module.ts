import { Module } from '@nestjs/common';
import { ZTTeamFFmpegService } from './ffmpeg.service';
import { ZTTeamPuppeteerService } from './puppeteer.service';
import { ZTTeamBgmService } from './bgm.service';
import { ZTTeamHookVideoService } from './hook-video.service';
import { ZTTeamMediaController } from './media.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ZTTeamAIModule } from '../ai/ai.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, ZTTeamAIModule, TelegramModule],
  controllers: [ZTTeamMediaController],
  providers: [
    ZTTeamFFmpegService,
    ZTTeamPuppeteerService,
    ZTTeamBgmService,
    ZTTeamHookVideoService,
  ],
  exports: [
    ZTTeamFFmpegService,
    ZTTeamPuppeteerService,
    ZTTeamBgmService,
    ZTTeamHookVideoService,
  ],
})
export class ZTTeamMediaModule {}
