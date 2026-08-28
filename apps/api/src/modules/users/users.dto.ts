import { createZodDto } from 'nestjs-zod';
import { deleteAccountSchema, updateMeSchema } from '@masalim/validation';

export class UpdateMeDto extends createZodDto(updateMeSchema) {}
export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}
