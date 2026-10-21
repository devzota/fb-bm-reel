import { Controller, Get, Put, Body, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import { ZTTeamSettingsService } from './settings.service';
import { ZTTeamAuthGuard } from '../auth/auth.guard';

@Controller('settings')
@UseGuards(ZTTeamAuthGuard)
export class ZTTeamSettingsController {
  constructor(private readonly settingsService: ZTTeamSettingsService) {}

  @Get()
  async ztteam_getSettings(@Request() req: any) {
    if (req.user.role !== 'ADMIN') {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return this.settingsService.ztteam_getSettings();
  }

  @Get('ai-health')
  async ztteam_getAiHealth() {
    return this.settingsService.ztteam_getAiHealth();
  }

  @Put()
  async ztteam_updateSettings(@Request() req: any, @Body() data: any) {
    if (req.user.role !== 'ADMIN') {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return this.settingsService.ztteam_updateSettings(data);
  }
}
