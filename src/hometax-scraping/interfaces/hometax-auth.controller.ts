import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfirmSimpleAuthDto, RequestSimpleAuthDto } from '../dto/auth.dto';
import { HometaxAuthService } from '../services/hometax-auth.service';

@ApiTags('auth')
@Controller('hometax/auth')
export class HometaxAuthController {
  constructor(private readonly authService: HometaxAuthService) {}

  @ApiOperation({ summary: '간편인증 요청', description: '이름/전화번호/생년월일로 홈택스 간편인증 요청을 시작합니다.' })
  @ApiOkResponse({ description: '홈택스 간편인증 요청 결과 원문/요약' })
  @Post('request')
  requestSimpleAuth(@Body() dto: RequestSimpleAuthDto): Promise<unknown> {
    return this.authService.requestSimpleAuth(dto);
  }

  @ApiOperation({ summary: '간편인증 확인', description: '사용자가 앱에서 인증을 완료한 뒤 홈택스 로그인 세션을 확정합니다.' })
  @ApiOkResponse({ description: '로그인 세션 확정 결과' })
  @Post('confirm')
  confirmSimpleAuth(@Body() dto: ConfirmSimpleAuthDto): Promise<unknown> {
    return this.authService.confirmSimpleAuth(dto);
  }

  @ApiOperation({ summary: '현재 홈택스 세션 요약 조회' })
  @ApiOkResponse({ description: '메모리에 저장된 단일 테스트 세션 요약' })
  @Get('session')
  getSession(): Record<string, unknown> {
    return this.authService.getSessionSummary();
  }

  @ApiOperation({ summary: '현재 홈택스 세션 초기화' })
  @ApiOkResponse({ description: '세션 초기화 결과' })
  @Post('reset')
  reset(): Record<string, unknown> {
    return this.authService.reset();
  }
}
