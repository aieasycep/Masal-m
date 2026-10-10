import type Redis from 'ioredis';
import type { Queue } from 'bullmq';
import { AIJobStatus, AIJobType, ErrorCode } from '@masalim/types';
import { Prisma } from '@masalim/database';
import type { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

interface JobRow {
  id: string;
  userId: string;
  type: AIJobType;
  entityId: string | null;
  status: AIJobStatus;
  queueJobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on queueJobId', {
    code: 'P2002',
    clientVersion: 'test',
  });

/**
 * Fake Prisma around one `AIJob` table. `createBehaviour` lets a test make
 * the insert lose a race (P2002) while the winner row is already present.
 */
function buildService(options: { existing?: JobRow[]; createThrows?: () => Error } = {}) {
  const rows: JobRow[] = [...(options.existing ?? [])];
  let nextId = 1;
  const prisma = {
    aIJob: {
      findUnique: jest.fn(async ({ where }: { where: { queueJobId?: string; id?: string } }) => {
        return (
          rows.find(
            (row) =>
              (where.queueJobId != null && row.queueJobId === where.queueJobId) ||
              (where.id != null && row.id === where.id),
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: { data: Omit<JobRow, 'id'> }) => {
        if (options.createThrows) throw options.createThrows();
        const row: JobRow = { ...data, id: `job-${nextId++}`, errorCode: null, errorMessage: null };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<JobRow> }) => {
        const row = rows.find((item) => item.id === where.id);
        if (row == null) throw new Error('row missing');
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const redis = { publish: jest.fn(async () => 1) } as unknown as Redis;
  const service = new JobsService(prisma as unknown as PrismaService, redis);
  const add = jest.fn(async () => undefined);
  jest.spyOn(service, 'getQueue').mockReturnValue({ add } as unknown as Queue);
  return { service, prisma, rows, add };
}

const INPUT = {
  userId: 'u1',
  type: AIJobType.STORY_GENERATION,
  entityId: 's1',
  queueJobId: 'story:s1:v1:gen',
} as const;

describe('JobsService.enqueue', () => {
  it('creates the row and adds the queue job keyed by the row id', async () => {
    const { service, add, rows } = buildService();

    const row = await service.enqueue(INPUT);

    expect(rows).toHaveLength(1);
    expect(row.status).toBe(AIJobStatus.QUEUED);
    expect(add).toHaveBeenCalledWith('story-generation', { aiJobId: row.id }, { jobId: row.id });
  });

  it('returns the live row when the deterministic key is already active', async () => {
    const existing: JobRow = {
      id: 'job-live',
      userId: 'u1',
      type: AIJobType.STORY_GENERATION,
      entityId: 's1',
      status: AIJobStatus.RUNNING,
      queueJobId: INPUT.queueJobId,
      errorCode: null,
      errorMessage: null,
    };
    const { service, add, prisma } = buildService({ existing: [existing] });

    const row = await service.enqueue(INPUT);

    expect(row.id).toBe('job-live');
    expect(prisma.aIJob.create).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('on a lost insert race (P2002) returns the winner row without enqueuing again', async () => {
    const winner: JobRow = {
      id: 'job-winner',
      userId: 'u1',
      type: AIJobType.STORY_GENERATION,
      entityId: 's1',
      status: AIJobStatus.QUEUED,
      queueJobId: INPUT.queueJobId,
      errorCode: null,
      errorMessage: null,
    };
    const { service, add, prisma } = buildService({ createThrows: uniqueViolation });
    // The first read misses (the winner inserts in between), the re-read sees it.
    prisma.aIJob.findUnique
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(winner as never);

    const row = await service.enqueue(INPUT);

    expect(row.id).toBe('job-winner');
    expect(prisma.aIJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.aIJob.findUnique).toHaveBeenCalledTimes(2);
    expect(add).not.toHaveBeenCalled();
  });

  it('rethrows a P2002 whose holder is not a live job', async () => {
    const stale: JobRow = {
      id: 'job-old',
      userId: 'u1',
      type: AIJobType.STORY_GENERATION,
      entityId: 's1',
      status: AIJobStatus.FAILED,
      queueJobId: INPUT.queueJobId,
      errorCode: null,
      errorMessage: null,
    };
    const { service, add, prisma } = buildService({ createThrows: uniqueViolation });
    prisma.aIJob.findUnique
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(stale as never);

    await expect(service.enqueue(INPUT)).rejects.toMatchObject({ code: 'P2002' });
    expect(add).not.toHaveBeenCalled();
  });

  it('rethrows other insert errors untouched', async () => {
    const { service } = buildService({ createThrows: () => new Error('db down') });

    await expect(service.enqueue(INPUT)).rejects.toThrow('db down');
  });

  it('marks the row FAILED when the queue add fails, then rethrows', async () => {
    const { service, add, rows } = buildService();
    add.mockRejectedValueOnce(new Error('redis gone'));

    await expect(service.enqueue(INPUT)).rejects.toThrow('redis gone');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: AIJobStatus.FAILED,
      errorCode: ErrorCode.INTERNAL,
      errorMessage: 'enqueue failed',
    });
    // The failed row no longer blocks the next submit.
    const next = await service.enqueue(INPUT);
    expect(next.id).not.toBe(rows[0]?.id);
    expect(next.status).toBe(AIJobStatus.QUEUED);
  });
});
