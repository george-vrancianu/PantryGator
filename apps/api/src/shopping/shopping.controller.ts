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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { CurrentUser as CurrentUserValue } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { MemberLanguageService } from '../member-language/member-language.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  addShoppingItemBody,
  addShoppingItemsBody,
  itemIdParam,
  removeShoppingItemsBody,
  setAmountBody,
  setCheckedBody,
  type AddShoppingItemBody,
  type AddShoppingItemsBody,
  type RemoveShoppingItemsBody,
  type SetAmountBody,
  type SetCheckedBody,
  type ShoppingListView,
  type AddedShoppingItemsView,
} from './shopping.schemas';
import { ShoppingService } from './shopping.service';

const idParam = new ZodValidationPipe(itemIdParam);

/** Every route works on the signed-in Member's Family list; names come back in the Member's Catalog Language. */
@ApiTags('shopping-list')
@UseGuards(AuthGuard)
@Controller('shopping-list')
export class ShoppingController {
  constructor(
    private readonly shopping: ShoppingService,
    private readonly languages: MemberLanguageService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Return the Family's active Shopping List, creating it on demand",
  })
  async get(
    @CurrentUser() member: CurrentUserValue,
  ): Promise<ShoppingListView> {
    return this.shopping.getList(
      member.id,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Post('items')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Add a Shopping Item, merging into an existing line for the same Ingredient and unit',
  })
  async add(
    @CurrentUser() member: CurrentUserValue,
    @Body(new ZodValidationPipe(addShoppingItemBody)) body: AddShoppingItemBody,
  ): Promise<ShoppingListView> {
    return this.shopping.addItem(
      member.id,
      body,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Post('items/bulk')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Add several Shopping Items at once (applying a Shopping Template), merging as for a single add; all or none',
  })
  async addMany(
    @CurrentUser() member: CurrentUserValue,
    @Body(new ZodValidationPipe(addShoppingItemsBody))
    body: AddShoppingItemsBody,
  ): Promise<AddedShoppingItemsView> {
    return this.shopping.addItems(
      member.id,
      body.items,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Post('items/bulk-delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Remove several Shopping Items at once (Undo of an add); all or none. Ids that are already gone or not on the Family's list are ignored, never an error",
  })
  async removeMany(
    @CurrentUser() member: CurrentUserValue,
    @Body(new ZodValidationPipe(removeShoppingItemsBody))
    body: RemoveShoppingItemsBody,
  ): Promise<ShoppingListView> {
    return this.shopping.removeMany(
      member.id,
      body.ids,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Check or uncheck a Shopping Item' })
  async setChecked(
    @CurrentUser() member: CurrentUserValue,
    @Param(idParam) { id }: { id: string },
    @Body(new ZodValidationPipe(setCheckedBody)) body: SetCheckedBody,
  ): Promise<ShoppingListView> {
    return this.shopping.setChecked(
      member.id,
      id,
      body.checked,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Put('items/:id/amount')
  @ApiOperation({ summary: "Set a Shopping Item's quantity and unit" })
  async setAmount(
    @CurrentUser() member: CurrentUserValue,
    @Param(idParam) { id }: { id: string },
    @Body(new ZodValidationPipe(setAmountBody)) body: SetAmountBody,
  ): Promise<ShoppingListView> {
    return this.shopping.setAmount(
      member.id,
      id,
      body,
      await this.languages.catalogLanguageOf(member.id),
    );
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove a Shopping Item' })
  async remove(
    @CurrentUser() member: CurrentUserValue,
    @Param(idParam) { id }: { id: string },
  ): Promise<ShoppingListView> {
    return this.shopping.removeItem(
      member.id,
      id,
      await this.languages.catalogLanguageOf(member.id),
    );
  }
}
