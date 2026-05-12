import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { LearningSessionModule } from './learning-session/learning-session.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, LearningSessionModule],
})
export class AppModule {}
