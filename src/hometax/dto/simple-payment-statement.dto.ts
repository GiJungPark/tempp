import { ApiPropertyOptional } from '@nestjs/swagger';

export type SimplePaymentStatementIncomeType = 'business-income' | 'other-income';

export class ValidateSimplePaymentStatementFileDto {
  @ApiPropertyOptional({ description: '지급연도 YYYY', example: '2026' })
  paymentYear?: string;

  @ApiPropertyOptional({ description: '지급월 MM', example: '05' })
  paymentMonth?: string;

  @ApiPropertyOptional({ description: '제출구분', enum: ['regular', 'amended', 'late'], example: 'regular' })
  filingType?: 'regular' | 'amended' | 'late';

  @ApiPropertyOptional({ description: '홈택스 신고서 종류 코드 override. HAR 확정 전 디버깅용' })
  stmnKndCd?: string;

  @ApiPropertyOptional({ description: '홈택스 업무분야 코드 override. HAR 확정 전 디버깅용' })
  bsafClCd?: string;

  @ApiPropertyOptional({ description: '홈택스 세목/인터페이스 코드 override. HAR 확정 전 디버깅용' })
  itrfCd?: string;

  @ApiPropertyOptional({ description: '홈택스 민원 종류 코드 override. HAR 확정 전 디버깅용' })
  cvaKndCd?: string;

  @ApiPropertyOptional({ description: 'RAON 업로드 타입 코드', example: '02' })
  uploadTypeCd?: string;

  @ApiPropertyOptional({ description: '홈택스 wqAction 호출 base URL override', example: 'https://hometax.go.kr' })
  baseURL?: string;

  @ApiPropertyOptional({ description: 'RAON 업로드 base URL override', example: 'https://hometax.go.kr' })
  uploadBaseURL?: string;

  @ApiPropertyOptional({ description: '홈택스 Referer override' })
  referer?: string;

  @ApiPropertyOptional({ description: '실제 업무 화면 ID override', example: 'UWEICAAD15' })
  realScreenId?: string;

  @ApiPropertyOptional({ description: '전자파일 비밀번호가 있는 경우 평문 입력. 서버에서 base64 처리' })
  encryptedPassword?: string;
}
