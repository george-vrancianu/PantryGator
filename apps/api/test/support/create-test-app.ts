import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
// Env comes from ./env.ts via jest setupFiles.
import {
  StructuredOutputAiService,
  type StructuredOutputRequest,
} from '../../src/ai/structured-output-ai.service';
import { IngredientCatalogService } from '../../src/ingredients/ingredient-catalog.service';
import { answerWithCatalogIndices } from './catalog-indices';
import { TranscriptionService } from '../../src/voice/transcription.service';
import { AppModule } from '../../src/app.module';
import {
  OPEN_FOOD_FACTS_CLIENT,
  type OpenFoodFactsClient,
} from '../../src/barcode/open-food-facts.client';
import {
  PAGE_FETCHER,
  type PageFetcher,
} from '../../src/page-fetch/page-fetcher';
import { configureApp, DEFAULT_REQUEST_BODY_BYTES } from '../../src/app.setup';
import { serveWebApp } from '../../src/web-app';

/** What a fake provider call reports when the test does not say (an explicit `usage` key, even `undefined`, wins). */
export const FAKE_MODEL = 'gpt-6-luna';
export const FAKE_USAGE = { inputTokens: 100, outputTokens: 20 };

const withFakeUsage = <T extends { model?: string; usage?: unknown }>(
  result: T,
): T => ({
  ...result,
  model: result.model ?? FAKE_MODEL,
  ...('usage' in result ? {} : { usage: FAKE_USAGE }),
});

export const TEST_ORIGIN = 'http://localhost:5173';

/** Boots the real app module against the test database, (migrations are applied once by global-setup.mjs). */
export async function createTestApp(
  controllers: Type<unknown>[] = [],
  /** Stands in for the AI provider at the structured-output service boundary; no test calls the network. */
  ai?: Pick<StructuredOutputAiService, 'generate'>,
  /** Built web app to serve alongside the API, as `WEB_DIST_DIR` does. */
  webDistDir?: string,
  /** Stands in for the Open Food Facts client; no test reaches the real Open Food Facts. */
  openFoodFacts?: OpenFoodFactsClient,
  /** Stands in for the audio transcription provider; no test calls the network. */
  transcription?: Pick<TranscriptionService, 'isConfigured' | 'transcribe'>,
  /** Stands in for the page fetcher (Recipe from Link); no test fetches a real page. */
  pageFetcher?: PageFetcher,
): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers,
  });
  // The fake answers with Ingredient ids; the app gets Catalog indices, as from the real model.
  let generate: StructuredOutputAiService['generate'] | undefined;
  if (ai) {
    builder.overrideProvider(StructuredOutputAiService).useValue({
      generate: (
        request: StructuredOutputRequest,
        options?: Parameters<StructuredOutputAiService['generate']>[1],
      ) => generate!(request, options),
    });
  }
  if (transcription) {
    builder.overrideProvider(TranscriptionService).useValue({
      isConfigured: () => transcription.isConfigured(),
      transcribe: async (
        request: Parameters<TranscriptionService['transcribe']>[0],
      ) => withFakeUsage(await transcription.transcribe(request)),
    });
  }
  builder.overrideProvider(OPEN_FOOD_FACTS_CLIENT).useValue(
    openFoodFacts ?? {
      fetchProduct: () => {
        throw new Error('This test did not provide an Open Food Facts client');
      },
    },
  );
  builder.overrideProvider(PAGE_FETCHER).useValue(
    pageFetcher ?? {
      fetchPage: () => {
        throw new Error('This test did not provide a page fetcher');
      },
    },
  );
  const moduleRef = await builder.compile();
  if (ai) {
    generate = answerWithCatalogIndices(
      async (request, options) =>
        withFakeUsage(await ai.generate(request, options)),
      moduleRef.get(IngredientCatalogService),
    );
  }
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ bodyLimit: DEFAULT_REQUEST_BODY_BYTES }),
  );
  configureApp(app);
  if (webDistDir) await serveWebApp(app, webDistDir);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
