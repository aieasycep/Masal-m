import { Module } from '@nestjs/common';
import { DevStorageController } from './dev-storage.controller';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController, DevStorageController],
})
export class UploadsModule {}
