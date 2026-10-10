import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/** Every request must carry a supported app version (app-version gate). */
export const V = ['x-app-version', '0.1.0'] as const;

export interface Session {
  token: string;
  refresh: string;
  userId: string;
}

export interface TestApp {
  app: INestApplication;
  http: () => request.Agent;
  /** Register a throw-away e-mail account and return its session. */
  register: (tag: string) => Promise<Session>;
  /** Poll a job until it is terminal (max ~40s); returns the final status. */
  waitForJob: (session: Session, jobId: string) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Boot the real module graph (mock providers, inline workers) for an
 * integration spec. `overrides` may swap providers before compilation, e.g.
 * `(b) => b.overrideProvider(ENV).useValue({ ...env, MAIL_PROVIDER: 'smtp' })`.
 * Requires Postgres + Redis with migrations + seed applied.
 */
export async function createApp(
  overrides?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides) builder = overrides(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const http = () => request(app.getHttpServer());

  const register = async (tag: string): Promise<Session> => {
    const res = await http()
      .post('/auth/register')
      .set(...V)
      .send({
        email: `it-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`,
        password: 'parola-123456',
        name: 'Test Ebeveyn',
      })
      .expect(201);
    return {
      token: res.body.tokens.accessToken,
      refresh: res.body.tokens.refreshToken,
      userId: res.body.user.id,
    };
  };

  const waitForJob = async (session: Session, jobId: string): Promise<string> => {
    for (let i = 0; i < 40; i++) {
      const res = await http()
        .get(`/jobs/${jobId}`)
        .set(...V)
        .set('Authorization', `Bearer ${session.token}`)
        .expect(200);
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(res.body.status)) {
        return res.body.status;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return 'TIMEOUT';
  };

  return { app, http, register, waitForJob, close: () => app.close() };
}
