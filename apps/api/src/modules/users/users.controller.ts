import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Me } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { DeleteAccountDto, UpdateMeDto } from './users.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<Me> {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateMeDto): Promise<Me> {
    return this.usersService.updateMe(user.id, body);
  }

  @HttpCode(200)
  @Delete('me')
  requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteAccountDto,
  ): Promise<Me> {
    return this.usersService.requestDeletion(user.id, body);
  }

  @HttpCode(200)
  @Post('me/deletion/cancel')
  cancelDeletion(@CurrentUser() user: AuthenticatedUser): Promise<Me> {
    return this.usersService.cancelDeletion(user.id);
  }
}
