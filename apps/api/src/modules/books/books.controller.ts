import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import {
  createBookSchema,
  renderBookSchema,
  updateBookSchema,
  type Book,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { BooksService } from './books.service';

class CreateBookDto extends createZodDto(createBookSchema) {}
class UpdateBookDto extends createZodDto(updateBookSchema) {}
class RenderBookDto extends createZodDto(renderBookSchema) {}

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Book[]> {
    return this.books.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateBookDto): Promise<Book> {
    return this.books.create(user.id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Book> {
    return this.books.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateBookDto,
  ): Promise<Book> {
    return this.books.update(user.id, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.books.remove(user.id, id);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 6 } })
  @Post(':id/render')
  render(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RenderBookDto,
  ): Promise<{ jobId: string }> {
    return this.books.render(user.id, id, body);
  }
}
