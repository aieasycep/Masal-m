import { createZodDto } from 'nestjs-zod';
import {
  createChildSchema,
  recommendationsQuerySchema,
  updateChildSchema,
} from '@masalim/validation';

export class CreateChildDto extends createZodDto(createChildSchema) {}
export class UpdateChildDto extends createZodDto(updateChildSchema) {}
export class RecommendationsQueryDto extends createZodDto(recommendationsQuerySchema) {}
