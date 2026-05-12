import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { LearningSessionService } from './learning-session.service';

interface AuthenticatedRequest extends Request {
  user: { userId: number; email: string };
}

@Controller('api/el')
export class LearningSessionController {
  constructor(private readonly learningSessionService: LearningSessionService) {}

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async createSession(
    @Body() createSessionDto: CreateSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.learningSessionService.createSession(userId, createSessionDto.storyId);
  }
}
