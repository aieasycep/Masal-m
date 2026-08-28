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
import { createZodDto } from 'nestjs-zod';
import {
  createAddressSchema,
  updateAddressSchema,
  type Address,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { AddressesService } from './addresses.service';

class CreateAddressDto extends createZodDto(createAddressSchema) {}
class UpdateAddressDto extends createZodDto(updateAddressSchema) {}

@ApiTags('addresses')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Address[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateAddressDto): Promise<Address> {
    return this.addresses.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateAddressDto,
  ): Promise<Address> {
    return this.addresses.update(user.id, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(user.id, id);
  }
}
