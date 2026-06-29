import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestSimpleAuthDto {
  @ApiProperty({ description: '간편인증 대상자 이름', example: '박기중' })
  name!: string;

  @ApiProperty({ description: '휴대폰 번호. 하이픈 없이 보내는 것을 권장', example: '01021012449' })
  phoneNumber!: string;

  @ApiProperty({ description: '생년월일 YYMMDD 또는 YYYYMMDD. 현재 구현은 홈택스 요청 포맷에 맞춰 전달', example: '20000923' })
  birthday!: string;
}

export class ConfirmSimpleAuthDto {
  @ApiPropertyOptional({ description: 'true면 간편인증 완료까지 서버에서 polling 대기', example: true })
  wait?: boolean;

  @ApiPropertyOptional({ description: 'wait=true일 때 최대 대기 초', example: 120 })
  timeoutSeconds?: number;
}
