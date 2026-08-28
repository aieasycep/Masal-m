import { Injectable } from '@nestjs/common';
import type { Address as AddressDto, CreateAddressInput, UpdateAddressInput } from '@masalim/validation';
import type { Address as AddressRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AddressDto[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(userId: string, input: CreateAddressInput): Promise<AddressDto> {
    const count = await this.prisma.address.count({ where: { userId } });
    const row = await this.prisma.$transaction(async (tx) => {
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: { userId, ...input, isDefault: makeDefault },
      });
    });
    return this.toDto(row);
  }

  async update(userId: string, addressId: string, input: UpdateAddressInput): Promise<AddressDto> {
    await this.findOwned(userId, addressId);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id: addressId }, data: input });
    });
    return this.toDto(row);
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.findOwned(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  async findOwned(userId: string, addressId: string): Promise<AddressRow> {
    const row = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (row == null) throw AppException.notFound('Address not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private toDto(row: AddressRow): AddressDto {
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      addressLine: row.addressLine,
      city: row.city,
      district: row.district,
      postalCode: row.postalCode,
      isDefault: row.isDefault,
    };
  }
}
