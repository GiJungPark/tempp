import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 전자파일 DTO는 요청 body의 모양을 설명한다.
// Nest가 JSON body를 이 class 형태로 넘겨주고, service가 실제 고정폭 파일을 만든다.

// 제출자 구분: 국세청 전산매체 원문 기준 1=세무대리인, 2=법인, 3=개인.
export type SubmitterType = '1' | '2' | '3';
// 내외국인 구분: 1=내국인, 9=외국인.
export type ForeignerYn = '1' | '9';
// 사용자가 금액을 세전으로 입력했는지, 세후로 입력했는지 구분한다.
export type AmountInputType = 'gross' | 'net';
// 원천세 신고구분상세코드: 01=정기, 02=수정, 03=기한후.
export type FilingDetailCode = '01' | '02' | '03';

// 전자파일 A/B/Header 레코드에 반복해서 들어가는 사업장/제출자 정보다.
export class ElectronicBusinessPlaceDto {
  // 홈택스에서 내려주는 관할 세무서코드가 있으면 직접 넣는다. 없으면 address로 CSV 매칭한다.
  @ApiPropertyOptional({ description: '관할 세무서코드. 없으면 address를 기준으로 source/기준자료 CSV에서 자동 추정', example: '211' })
  taxOfficeCode?: string;

  @ApiProperty({ description: '사업자등록번호. 하이픈 없이 10자리 권장', example: '1234567890' })
  businessNo!: string;

  @ApiProperty({ description: '홈택스 ID', example: 'weeds2577' })
  hometaxId!: string;

  @ApiProperty({ description: '상호/법인명', example: '테스트상호' })
  businessName!: string;

  @ApiProperty({ description: '대표자명', example: '홍길동' })
  representativeName!: string;

  @ApiPropertyOptional({ description: '사업장 주소. taxOfficeCode가 없으면 관할 세무서코드 추정에 사용', example: '서울특별시 강남구 청담동 학동로 425' })
  address?: string;

  @ApiPropertyOptional({ description: '사업장 전화번호 또는 담당자 전화번호', example: '010-1234-5678' })
  phone?: string;

  @ApiPropertyOptional({ description: '전자메일 주소', example: 'test@example.com' })
  email?: string;

  @ApiPropertyOptional({ description: '제출자 구분. 1=세무대리인, 2=법인, 3=개인', enum: ['1', '2', '3'], example: '3' })
  submitterType?: SubmitterType;

  @ApiPropertyOptional({ description: '세무대리인 관리번호. submitterType=1일 때 사용' })
  taxAgentManagementNo?: string;

  @ApiPropertyOptional({ description: '자료제출 담당 부서명', example: '경영' })
  managerDepartment?: string;

  @ApiPropertyOptional({ description: '자료제출 담당자명. 없으면 representativeName 사용', example: '홍길동' })
  managerName?: string;

  @ApiPropertyOptional({ description: '자료제출 담당자 전화번호. 없으면 phone 사용', example: '010-1234-5678' })
  managerPhone?: string;
}

// 사업소득/기타소득 소득자 입력의 공통 부분이다.
export class IncomePaymentRecipientDto {
  @ApiProperty({ description: '소득자 이름', example: '김소득' })
  name!: string;

  @ApiProperty({ description: '소득자 주민등록번호/외국인등록번호/사업자번호', example: '9001011234567' })
  identityNo!: string;

  @ApiProperty({ description: '소득자 전화번호. 전산매체 레코드에는 직접 쓰지 않지만 기획 입력값으로 보존', example: '01012345678' })
  phone!: string;

  @ApiHideProperty()
  foreignerYn?: ForeignerYn;

  @ApiProperty({ description: '귀속연월 YYYYMM', example: '202605' })
  attributionYm!: string;

  @ApiProperty({ description: '지급일자 YYYYMMDD. 간이지급명세서 지급연월과 지급명세서 지급연도 산출에 사용', example: '20260531' })
  paymentDate!: string;

  @ApiProperty({ description: '입력 금액 기준. gross=세전, net=세후', enum: ['gross', 'net'], example: 'gross' })
  amountInputType!: AmountInputType;

  @ApiProperty({ description: '입력 금액. amountInputType 기준으로 해석', example: 1000000 })
  amount!: number;

  @ApiHideProperty()
  paymentCount?: number;
}

// 사업소득은 국세청 규격상 업종코드가 핵심 분류값이다.
export class BusinessIncomePaymentRecipientDto extends IncomePaymentRecipientDto {
  @ApiProperty({ description: '사업소득 업종코드', example: '940909' })
  industryCode!: string;

  @ApiHideProperty()
  taxRate?: 3 | 5 | 20;

  @ApiHideProperty()
  recipientBusinessNo?: string;

  @ApiHideProperty()
  recipientBusinessName?: string;
}

// 기타소득은 국세청 규격상 소득구분코드(예: 76, 79)가 핵심 분류값이다.
export class OtherIncomePaymentRecipientDto extends IncomePaymentRecipientDto {
  @ApiProperty({ description: '기타소득 소득구분코드. 서비스 MVP는 76/79 중심', example: '76' })
  incomeTypeCode!: string;

  @ApiHideProperty()
  necessaryExpenseRate?: number;

  @ApiHideProperty()
  necessaryExpense?: number;

  @ApiHideProperty()
  taxRate?: 20 | 15 | 0 | 30;
}

// 원천징수이행상황신고서 C103900 생성 요청.
export class GenerateWithholdingTaxFileDto {
  @ApiHideProperty()
  businessPlace?: ElectronicBusinessPlaceDto;

  @ApiProperty({ description: '지급연월 YYYYMM', example: '202605' })
  paymentYm!: string;

  @ApiPropertyOptional({ description: '귀속연월 YYYYMM. 없으면 첫 소득자 귀속연월 또는 paymentYm 사용', example: '202605' })
  attributionYm?: string;

  @ApiHideProperty()
  submitYm?: string;

  @ApiHideProperty()
  writtenDate?: string;

  @ApiHideProperty()
  reportDetailCode?: FilingDetailCode;

  @ApiPropertyOptional({ description: '사업소득 소득자 목록', type: [BusinessIncomePaymentRecipientDto] })
  businessIncomeRecipients?: BusinessIncomePaymentRecipientDto[];

  @ApiPropertyOptional({ description: '기타소득 소득자 목록', type: [OtherIncomePaymentRecipientDto] })
  otherIncomeRecipients?: OtherIncomePaymentRecipientDto[];
}

// 간이지급명세서(거주자의 사업소득) 생성 요청.
export class GenerateSimpleBusinessIncomeStatementFileDto {
  @ApiHideProperty()
  businessPlace?: ElectronicBusinessPlaceDto;

  @ApiHideProperty()
  paymentYear?: string;

  @ApiHideProperty()
  paymentMonth?: string;

  @ApiHideProperty()
  paymentHalf?: '1' | '2';

  @ApiHideProperty()
  submitDate?: string;

  @ApiProperty({ description: '사업소득 소득자 목록', type: [BusinessIncomePaymentRecipientDto] })
  recipients!: BusinessIncomePaymentRecipientDto[];
}

// 간이지급명세서(거주자의 기타소득) 생성 요청.
export class GenerateSimpleOtherIncomeStatementFileDto {
  @ApiHideProperty()
  businessPlace?: ElectronicBusinessPlaceDto;

  @ApiHideProperty()
  paymentYear?: string;

  @ApiHideProperty()
  paymentMonth?: string;

  @ApiHideProperty()
  submitDate?: string;

  @ApiProperty({ description: '기타소득 소득자 목록', type: [OtherIncomePaymentRecipientDto] })
  recipients!: OtherIncomePaymentRecipientDto[];
}

// 연간 사업소득 지급명세서 생성 요청.
export class GenerateAnnualBusinessIncomeStatementFileDto {
  @ApiHideProperty()
  businessPlace?: ElectronicBusinessPlaceDto;

  @ApiHideProperty()
  attributionYear?: string;

  @ApiHideProperty()
  submitDate?: string;

  @ApiHideProperty()
  fileNamePrefix?: string;

  @ApiHideProperty()
  submissionPeriodCode?: '1' | '2' | '3';

  @ApiProperty({ description: '사업소득 소득자 목록', type: [BusinessIncomePaymentRecipientDto] })
  recipients!: BusinessIncomePaymentRecipientDto[];
}

// 연간 기타소득 지급명세서 생성 요청.
export class GenerateAnnualOtherIncomeStatementFileDto {
  @ApiHideProperty()
  businessPlace?: ElectronicBusinessPlaceDto;

  @ApiHideProperty()
  attributionYear?: string;

  @ApiHideProperty()
  submitDate?: string;

  @ApiHideProperty()
  fileNamePrefix?: string;

  @ApiHideProperty()
  submissionPeriodCode?: '1' | '2' | '3';

  @ApiProperty({ description: '기타소득 소득자 목록', type: [OtherIncomePaymentRecipientDto] })
  recipients!: OtherIncomePaymentRecipientDto[];
}

export class ElectronicFileRecordSummaryDto {
  @ApiProperty({ description: '레코드 순번', example: 1 })
  index!: number;

  @ApiProperty({ description: '레코드 타입', example: 'A' })
  type!: string;

  @ApiProperty({ description: '레코드 byte 길이', example: 170 })
  byteLength!: number;
}

export class GeneratedElectronicFileDto {
  @ApiProperty({ description: '생성된 전자파일명', example: 'SF1234567.890' })
  fileName!: string;

  @ApiProperty({ description: '파일 인코딩', example: 'cp949' })
  encoding!: string;

  @ApiProperty({ description: 'CP949 인코딩 파일 byte를 base64로 변환한 값' })
  contentBase64!: string;

  @ApiProperty({ description: '디버깅용 텍스트 미리보기. 실제 저장은 contentBase64 사용 권장' })
  textPreview!: string;

  @ApiProperty({ description: '레코드별 byte 길이 요약', type: [ElectronicFileRecordSummaryDto] })
  records!: ElectronicFileRecordSummaryDto[];

  @ApiProperty({ description: '생성 시 주의/미구현 안내', type: [String], example: [] })
  warnings!: string[];
}
