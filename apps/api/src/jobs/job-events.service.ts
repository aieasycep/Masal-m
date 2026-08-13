import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Subject, type Observable } from 'rxjs';
import { jobStreamEventSchema, type JobStreamEvent } from '@masalim/validation';
import { REDIS } from '../redis/redis.module';
import { jobChannel } from './jobs.service';

/**
 * Fan-out of job progress events for SSE (§6a). A single dedicated Redis
 * subscriber connection listens per-job channels (pub/sub crosses process
 * boundaries, so a separate worker process still feeds API-side streams).
 */
@Injectable()
export class JobEventsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobEventsService.name);
  private subscriber!: Redis;
  private readonly subjects = new Map<string, { subject: Subject<JobStreamEvent>; refs: number }>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('message', (channel: string, message: string) => {
      const entry = this.subjects.get(channel);
      if (entry == null) return;
      try {
        entry.subject.next(jobStreamEventSchema.parse(JSON.parse(message)));
      } catch (error) {
        this.logger.warn({ err: error as Error, channel }, 'malformed job event dropped');
      }
    });
  }

  /** Subscribe to one job's live events; unsubscribes from Redis when the last listener leaves. */
  observe(aiJobId: string): Observable<JobStreamEvent> {
    const channel = jobChannel(aiJobId);
    return new Observable<JobStreamEvent>((observer) => {
      let entry = this.subjects.get(channel);
      if (entry == null) {
        entry = { subject: new Subject<JobStreamEvent>(), refs: 0 };
        this.subjects.set(channel, entry);
        this.subscriber.subscribe(channel).catch((error) => {
          this.logger.error({ err: error as Error, channel }, 'redis subscribe failed');
        });
      }
      entry.refs += 1;
      const subscription = entry.subject.subscribe(observer);

      return () => {
        subscription.unsubscribe();
        const current = this.subjects.get(channel);
        if (current == null) return;
        current.refs -= 1;
        if (current.refs <= 0) {
          this.subjects.delete(channel);
          this.subscriber.unsubscribe(channel).catch(() => undefined);
        }
      };
    });
  }

  async onApplicationShutdown(): Promise<void> {
    for (const { subject } of this.subjects.values()) subject.complete();
    this.subjects.clear();
    await this.subscriber?.quit().catch(() => undefined);
  }
}
