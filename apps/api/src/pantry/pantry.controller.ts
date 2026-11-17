import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CurrentUser as CurrentUserValue } from '../auth/auth.types';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MemberLanguageService } from '../member-language/member-language.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  batchIdParam,
  ingredientIdParam,
  createBatchBody,
  createBatchesBody,
  deleteBatchesBody,
  updateBatchBody,
  recentlyStockedQuery,
  type RecentlyStockedQuery,
  type RecentlyStockedView,
  scanQuery,
  type BatchView,
  type BatchIdParam,
  type IngredientIdParam,
  type CreateBatchBody,
  type CreateBatchesBody,
  type DeleteBatchesBody,
  type UpdateBatchBody,
  type ScanQuery,
} from './pantry.schemas';
import { PantryService } from './pantry.service';
import { RecentlyStockedService } from './recently-stocked.service';
import { RunningLowService } from './running-low.service';

@ApiTags('pantry')
@Controller('pantry')
@UseGuards(AuthGuard)
export class PantryController {
  constructor(
    private readonly pantry: PantryService,
    private readonly recentlyStocked: RecentlyStockedService,
    private readonly runningLow: RunningLowService,
    private readonly languages: MemberLanguageService,
  ) {}

  @Get('recently-stocked')
  @ApiOperation({
    summary:
      'The Ingredients the Family most recently added to the Pantry, newest first, in the Pantry or not',
  })
  async recentlyStockedList(
    @CurrentUser() member: CurrentUserValue,
    @Query(new ZodValidationPipe(recentlyStockedQuery))
    query: RecentlyStockedQuery,
  ): Promise<{ ingredients: RecentlyStockedView[] }> {
    return {
      ingredients: await this.recentlyStocked.list(
        member.id,
        await this.languages.catalogLanguageOf(member.id),
        query.limit,
      ),
    };
  }

  @Get('last-stocked')
  @ApiOperation({
    summary:
      'When the Family last added to the Pantry: the later of Stock history and the newest Batch, used-up and Unmatched ones included (null when never)',
  })
  async lastStocked(
    @CurrentUser() member: CurrentUserValue,
  ): Promise<{ lastStockedAt: string | null }> {
    return {
      lastStockedAt: await this.recentlyStocked.lastStockedAt(member.id),
    };
  }

  @Get()
  @ApiOperation({
    summary:
      "The Family's Batches, soonest expiry first, names localised, and the Ingredients flagged running low",
  })
  async list(
    @CurrentUser() member: CurrentUserValue,
  ): Promise<{ batches: BatchView[]; runningLow: string[] }> {
    return {
      batches: await this.pantry.list(
        member.id,
        await this.languages.catalogLanguageOf(member.id),
      ),
      runningLow: await this.runningLow.list(member.id),
    };
  }

  @Put('running-low/:ingredientId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Flag an Ingredient as running low for the Family (idempotent); cleared by the Pantry toggle',
  })
  async setRunningLow(
    @CurrentUser() member: CurrentUserValue,
    @Param(new ZodValidationPipe(ingredientIdParam))
    params: IngredientIdParam,
  ): Promise<void> {
    await this.runningLow.set(member.id, params.ingredientId);
  }

  @Delete('running-low/:ingredientId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Clear the running low flag on an Ingredient (idempotent)',
  })
  async clearRunningLow(
    @CurrentUser() member: CurrentUserValue,
    @Param(new ZodValidationPipe(ingredientIdParam))
    params: IngredientIdParam,
  ): Promise<void> {
    await this.runningLow.clear(member.id, params.ingredientId);
  }

  @Post('batches')
  @ApiOperation({
    summary:
      'Add a Batch to the Family Pantry; location and expiry default from the Catalog',
  })
  async create(
    @CurrentUser() member: CurrentUserValue,
    @Query(new ZodValidationPipe(scanQuery)) query: ScanQuery,
    @Body(new ZodValidationPipe(createBatchBody)) body: CreateBatchBody,
  ): Promise<BatchView> {
    const [catalog, scanLanguage] = await Promise.all([
      this.languages.catalogLanguageOf(member.id),
      this.languages.scanLanguageOf(member.id, query.scanLanguage),
    ]);
    return this.pantry.create(member.id, body, catalog, scanLanguage);
  }

  @Post('batches/bulk')
  @ApiOperation({
    summary:
      'Add the reviewed lines of a Scan as Batches, all or none; the same per-line rules as a single Batch',
  })
  async createMany(
    @CurrentUser() member: CurrentUserValue,
    @Query(new ZodValidationPipe(scanQuery)) query: ScanQuery,
    @Body(new ZodValidationPipe(createBatchesBody)) body: CreateBatchesBody,
  ): Promise<{ batches: BatchView[] }> {
    const [catalog, scanLanguage] = await Promise.all([
      this.languages.catalogLanguageOf(member.id),
      this.languages.scanLanguageOf(member.id, query.scanLanguage),
    ]);
    return {
      batches: await this.pantry.createMany(
        member.id,
        body.batches,
        catalog,
        scanLanguage,
      ),
    };
  }

  @Post('batches/bulk-delete')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete many Batches of the Family Pantry at once; ids of another Family are ignored',
  })
  async removeMany(
    @CurrentUser() member: CurrentUserValue,
    @Body(new ZodValidationPipe(deleteBatchesBody)) body: DeleteBatchesBody,
  ): Promise<void> {
    await this.pantry.removeMany(member.id, body.ids);
  }

  @Patch('batches/:id')
  @ApiOperation({
    summary:
      'Edit a Batch of the Family Pantry (quantity, unit, expiry, Location, Product Description)',
  })
  async update(
    @CurrentUser() member: CurrentUserValue,
    @Param(new ZodValidationPipe(batchIdParam)) params: BatchIdParam,
    @Body(new ZodValidationPipe(updateBatchBody)) body: UpdateBatchBody,
  ): Promise<BatchView> {
    return this.pantry.update(
      member.id,
      params.id,
      body,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Delete('batches/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a Batch of the Family Pantry' })
  async remove(
    @CurrentUser() member: CurrentUserValue,
    @Param(new ZodValidationPipe(batchIdParam)) params: BatchIdParam,
  ): Promise<void> {
    await this.pantry.remove(member.id, params.id);
  }
}
