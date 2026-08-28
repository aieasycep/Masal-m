import { createZodDto } from 'nestjs-zod';
import { createChildSchema, updateChildSchema } from '@masalim/validation';

export class CreateChildDto extends createZodDto(createChildSchema) {}
export class UpdateChildDto extends createZodDto(updateChildSchema) {}
