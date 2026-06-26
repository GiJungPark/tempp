import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfirmSimpleAuthDto, RequestSimpleAuthDto } from '../dto/auth.dto';
import { HometaxAuthService } from '../services/hometax-auth.service';

@Controller('hometax/auth')
export class HometaxAuthController {
  constructor(private readonly authService: HometaxAuthService) {}

  @Post('request')
  requestSimpleAuth(@Body() dto: RequestSimpleAuthDto): Promise<unknown> {
    return this.authService.requestSimpleAuth(dto);
  }

  @Post('confirm')
  confirmSimpleAuth(@Body() dto: ConfirmSimpleAuthDto): Promise<unknown> {
    return this.authService.confirmSimpleAuth(dto);
  }

  @Get('session')
  getSession(): Record<string, unknown> {
    return this.authService.getSessionSummary();
  }

  @Post('reset')
  reset(): Record<string, unknown> {
    return this.authService.reset();
  }
}
