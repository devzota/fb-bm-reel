import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZTTeamRenderProcessor } from './render.processor';
import { ZTTeamRenderController } from './render.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ZTTeamAIModule } from '../ai/ai.module';
import { ZTTeamAudioModule } from '../audio/audio.module';
import { ZTTeamMediaModule } from '../media/media.module';
import { ZTTeamFacebookModule } from '../facebook/facebook.module';
import { ZTTeamRenderCron } from './render.cron';
import { ZTTeamPublisherCron } from './publisher.cron';
import { ZTTeamReelViralMonitorCron } from './reel-viral-monitor.cron';
import { ZTTeamWordpressModule } from '../wordpress/wordpress.module';

@Module({
  imports: [
    HttpModule,
    PrismaModule, 
    ZTTeamAIModule, 
    ZTTeamAudioModule, 
    ZTTeamMediaModule, 
    ZTTeamFacebookModule,
    ZTTeamWordpressModule
  ],
  controllers: [ZTTeamRenderController],
  providers: [
    ZTTeamRenderProcessor, 
    ZTTeamRenderCron, 
    ZTTeamPublisherCron, 
    ZTTeamReelViralMonitorCron
  ],
  exports: [ZTTeamRenderProcessor, ZTTeamReelViralMonitorCron],
})
export class ZTTeamRenderModule {}
