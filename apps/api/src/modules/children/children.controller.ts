import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Child, Recommendation } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { ChildrenService } from './children.service';
import { CreateChildDto, RecommendationsQueryDto, UpdateChildDto } from './children.dto';

@ApiTags('children')
@Controller('children')
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Child[]> {
    return this.childrenService.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Child> {
    return this.childrenService.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateChildDto): Promise<Child> {
    return this.childrenService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateChildDto,
  ): Promise<Child> {
    return this.childrenService.update(user.id, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.childrenService.remove(user.id, id);
  }

  @Get(':id/recommendations')
  recommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: RecommendationsQueryDto,
  ): Promise<Recommendation[]> {
    return this.childrenService.recommendations(user.id, id, query.limit);
  }
}
