import { Inject, Injectable } from '@nestjs/common';
import type { TextToSpeechProvider } from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import type { SystemVoice } from '@masalim/validation';
import type { SystemVoice as SystemVoiceRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE, TTS } from '../../providers/providers.module';

const PREVIEW_TEXT: Record<'tr' | 'en', string> = {
  tr: 'Bir varmış bir yokmuş… Uyku vakti geldiğinde, yıldızlar seninle birlikte masal dinlermiş.',
  en: 'Once upon a time… When bedtime came, the stars would listen to stories along with you.',
};

/** System narrator catalogue (Duru, Atlas, Luna, …) with lazily rendered previews. */
@Injectable()
export class SystemVoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(TTS) private readonly tts: TextToSpeechProvider,
  ) {}

  async list(): Promise<SystemVoice[]> {
    const rows = await this.prisma.systemVoice.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /**
   * Preview clip for the wizard's play buttons. Rendered once through the TTS
   * provider on first request, then cached in storage (previewKey).
   */
  async preview(systemVoiceId: string): Promise<{ previewUrl: string }> {
    const row = await this.prisma.systemVoice.findUnique({ where: { id: systemVoiceId } });
    if (row == null || !row.enabled) throw AppException.notFound('System voice not found');

    if (row.previewKey != null) {
      return { previewUrl: await this.storage.getSignedUrl(row.previewKey) };
    }

    const speech = await this.tts.generateSpeech({
      text: PREVIEW_TEXT.tr,
      providerVoiceId: row.providerVoiceId,
      language: 'tr',
    });
    const ext = speech.contentType.includes('wav') ? 'wav' : 'mp3';
    const key = StorageKeys.systemVoicePreview(row.id, ext);
    await this.storage.putObject(key, speech.audio, speech.contentType);
    await this.prisma.systemVoice.update({
      where: { id: row.id },
      data: { previewKey: key },
    });
    return { previewUrl: await this.storage.getSignedUrl(key) };
  }

  private async toDto(row: SystemVoiceRow): Promise<SystemVoice> {
    return {
      id: row.id,
      displayName: row.displayName,
      description: row.description,
      category: row.category,
      previewUrl: row.previewKey ? await this.storage.getSignedUrl(row.previewKey) : null,
      premiumOnly: row.premiumOnly,
    };
  }
}
