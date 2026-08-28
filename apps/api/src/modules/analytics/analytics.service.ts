import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsEvent } from '@masalim/analytics';
import type { AnalyticsBatchInput } from '@masalim/validation';

const KNOWN_EVENTS = new Set<string>(Object.values(AnalyticsEvent));

/**
 * Analytics dispatch (§49). The MVP provider logs structured events (they
 * land in the pino pipeline and any log sink); a PostHog/BigQuery adapter
 * replaces `dispatch` without touching ingestion. Unknown event names are
 * dropped — the registry in @masalim/analytics is the contract.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  ingest(userId: string, batch: AnalyticsBatchInput): { accepted: number; dropped: number } {
    let accepted = 0;
    let dropped = 0;
    for (const event of batch.events) {
      if (!KNOWN_EVENTS.has(event.name)) {
        dropped += 1;
        continue;
      }
      this.dispatch(userId, event.name, event.timestamp, event.properties);
      accepted += 1;
    }
    return { accepted, dropped };
  }

  private dispatch(
    userId: string,
    name: string,
    timestamp: number,
    properties: Record<string, string | number | boolean>,
  ): void {
    this.logger.log({ analytics: true, userId, event: name, timestamp, properties });
  }
}
