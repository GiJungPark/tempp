import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateWithholdingTaxFileDto {
  @ApiPropertyOptional({ description: '홈택스 원천세 신고구분 코드 override. HAR 확인 시 사용', example: '01' })
  rtnClCd?: string;

  @ApiPropertyOptional({ description: '홈택스 원천세 신고구분 상세 코드 override. HAR 확인 시 사용', example: '01' })
  rtnClDetailCd?: string;

  @ApiPropertyOptional({ description: '홈택스 신고서 종류 코드 override. HAR 확인 시 사용' })
  stmnKndCd?: string;

  @ApiPropertyOptional({ description: '전자파일 비밀번호가 있는 경우 평문 입력. 서버에서 base64 처리' })
  encryptedPassword?: string;
}

export class SubmitWithholdingTaxDto {
  @ApiProperty({ description: '파일 검증 완료 후 홈택스가 반환한 제출 민원 ID', example: '202606910000005258941859' })
  fleSbmsCvaId!: string;

  @ApiProperty({ description: '실제 신고 제출 방어 플래그. true가 아니면 제출하지 않음', example: true })
  confirmSubmit!: boolean;
}
