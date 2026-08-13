import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobEventsService } from './job-events.service';
import { JobsController } from './jobs.controller';

/** Queue registry + AIJob lifecycle + SSE progress streams (§7). */
@Global()
@Module({
  controllers: [JobsController],
  providers: [JobsService, JobEventsService],
  exports: [JobsService],
})
export class JobsModule {}
