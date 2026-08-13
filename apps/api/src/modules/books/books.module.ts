import { Module } from '@nestjs/common';
import { StoriesModule } from '../stories/stories.module';
import { BooksService } from './books.service';
import { BooksController } from './books.controller';
import { BookRenderProcessor } from './book-render.processor';

/** Book builder + Chromium print-PDF rendering (§30–§32). */
@Module({
  imports: [StoriesModule],
  controllers: [BooksController],
  providers: [BooksService, BookRenderProcessor],
  exports: [BooksService],
})
export class BooksModule {}
