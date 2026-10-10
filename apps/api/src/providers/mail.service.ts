import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * MailProvider abstraction. Mock logs messages (dev OTPs land in the API log);
 * the smtp adapter (nodemailer) is activated by MAIL_PROVIDER=smtp + SMTP_URL
 * (`smtp[s]://user:pass@host:port`) — see docs/providers.md and docs/go-live.md.
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

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
    if (this.env.SMTP_URL === '') {
      throw new Error('MAIL_PROVIDER=smtp requires SMTP_URL');
    }
    this.transporter ??= createTransport(this.env.SMTP_URL);
    const info = await this.transporter.sendMail({
      from: this.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    this.logger.info({ to: message.to, messageId: info.messageId }, 'mail sent');
  }
}
