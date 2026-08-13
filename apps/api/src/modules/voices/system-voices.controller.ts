import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SystemVoice } from '@masalim/validation';
import { SystemVoicesService } from './system-voices.service';

@ApiTags('voices')
@Controller('voices/system')
export class SystemVoicesController {
  constructor(private readonly systemVoices: SystemVoicesService) {}

  @Get()
  list(): Promise<SystemVoice[]> {
    return this.systemVoices.list();
  }

  @Post(':id/preview')
  preview(@Param('id') id: string): Promise<{ previewUrl: string }> {
    return this.systemVoices.preview(id);
  }
}
