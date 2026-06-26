import { Module } from '@nestjs/common';
import { HometaxModule } from './hometax/hometax.module';

@Module({
  imports: [HometaxModule],
})
export class AppModule {}
