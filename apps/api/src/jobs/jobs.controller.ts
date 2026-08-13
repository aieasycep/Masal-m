import { Controller, Get, Header, Param, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  defer,
  endWith,
  filter,
  ignoreElements,
  interval,
  map,
  merge,
  of,
  share,
  takeUntil,
  takeWhile,
  Observable,
} from 'rxjs';
import { AIJobStatus } from '@masalim/types';
import type { AIJob as AIJobRow } from '@masalim/database';
import type { AIJob, JobStreamEvent } from '@masalim/validation';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { JobEventsService } from './job-events.service';

const TERMINAL = new Set<string>([
  AIJobStatus.SUCCEEDED,
  AIJobStatus.FAILED,
  AIJobStatus.CANCELLED,
]);

function toEvent(row: AIJobRow): JobStreamEvent {
  return { id: row.id, status: row.status, progress: row.progress, errorCode: row.errorCode };
}

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobEvents: JobEventsService,
  ) {}

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<AIJob> {
    const row = await this.jobsService.getOwned(user.id, id);
    return this.jobsService.toDto(row);
  }

  /**
   * Live progress stream (§6a): snapshot on connect, then real worker events
   * relayed via Redis pub/sub; 15s heartbeats defeat proxy buffering; the
   * stream completes once a terminal state has been sent. Ownership is
   * checked before the stream opens so 403/404 surface as normal JSON errors.
   */
  @Sse(':id/stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Observable<MessageEvent>> {
    const initial = await this.jobsService.getOwned(user.id, id);

    const live$ = this.jobEvents.observe(id);
    // Re-read once the pub/sub subscription is active: closes the gap where a
    // terminal event could fire between the ownership read and subscribing.
    const recheck$ = defer(() => this.jobsService.getOwned(user.id, id)).pipe(map(toEvent));

    let maxProgress = -1;
    const data$ = merge(of(toEvent(initial)), live$, recheck$).pipe(
      // Drop stale reorderings (snapshot arriving after a newer live event).
      filter((event) => {
        if (TERMINAL.has(event.status)) return true;
        if (event.progress < maxProgress) return false;
        maxProgress = event.progress;
        return true;
      }),
      takeWhile((event) => !TERMINAL.has(event.status), true),
      map((event) => ({ type: 'job', data: event }) satisfies MessageEvent),
      share(),
    );

    const heartbeat$ = interval(15_000).pipe(
      map(() => ({ type: 'heartbeat', data: 'ping' }) satisfies MessageEvent),
      takeUntil(data$.pipe(ignoreElements(), endWith(true))),
    );

    return merge(data$, heartbeat$);
  }
}
