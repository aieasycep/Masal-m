import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * MailProvider abstraction. Mock logs messages (dev OTPs land in the API log);
 * the smtp adapter is activated by MAIL_PROVIDER=smtp + SMTP_URL — see
 * docs/providers.md for activation.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MailService.name);
  }

  async send(message: MailMessage): Promise<void> {
    if (this.env.MAIL_PROVIDER === 'mock') {
      // The body carries OTPs — it may only land in a local developer's log,
      // never in a shared (staging) server log.
      if (this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test') {
        this.logger.info(
          { to: message.to, subject: message.subject, body: message.text },
          'MOCK MAIL (would be sent in production)',
        );
      } else {
        this.logger.info(
          { to: message.to, subject: message.subject },
          'MOCK MAIL suppressed (body hidden outside development)',
        );
      }
      return;
    }
    // SMTP adapter: kept minimal — a fetch-based HTTP mail API or nodemailer
    // integration slots in here when a real mail provider is chosen.
    throw new Error(`Mail provider "${this.env.MAIL_PROVIDER}" is not configured`);
  }
}
