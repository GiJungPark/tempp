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
  taxOfficeCode?: string;
  businessNo!: string;
  hometaxId!: string;
  businessName!: string;
  representativeName!: string;
  address?: string;
  phone?: string;
  email?: string;
  submitterType?: SubmitterType;
  taxAgentManagementNo?: string;
  managerDepartment?: string;
  managerName?: string;
  managerPhone?: string;
}

// 사업소득/기타소득 소득자 입력의 공통 부분이다.
export class IncomePaymentRecipientDto {
  name!: string;
  identityNo!: string;
  foreignerYn?: ForeignerYn;
  attributionYm!: string;
  paymentDate?: string;
  amountInputType?: AmountInputType;
  amount!: number;
  paymentCount?: number;
}

// 사업소득은 국세청 규격상 업종코드가 핵심 분류값이다.
export class BusinessIncomePaymentRecipientDto extends IncomePaymentRecipientDto {
  industryCode!: string;
  taxRate?: 3 | 5 | 20;
  recipientBusinessNo?: string;
  recipientBusinessName?: string;
}

// 기타소득은 국세청 규격상 소득구분코드(예: 76, 79)가 핵심 분류값이다.
export class OtherIncomePaymentRecipientDto extends IncomePaymentRecipientDto {
  incomeTypeCode!: string;
  necessaryExpenseRate?: number;
  necessaryExpense?: number;
  taxRate?: 20 | 15 | 0 | 30;
}

// 원천징수이행상황신고서 C103900 생성 요청.
export class GenerateWithholdingTaxFileDto {
  businessPlace!: ElectronicBusinessPlaceDto;
  paymentYm!: string;
  attributionYm?: string;
  submitYm?: string;
  writtenDate?: string;
  reportDetailCode?: FilingDetailCode;
  businessIncomeRecipients?: BusinessIncomePaymentRecipientDto[];
  otherIncomeRecipients?: OtherIncomePaymentRecipientDto[];
}

// 간이지급명세서(거주자의 사업소득) 생성 요청.
export class GenerateSimpleBusinessIncomeStatementFileDto {
  businessPlace!: ElectronicBusinessPlaceDto;
  paymentYear!: string;
  paymentMonth!: string;
  paymentHalf?: '1' | '2';
  submitDate?: string;
  recipients!: BusinessIncomePaymentRecipientDto[];
}

// 간이지급명세서(거주자의 기타소득) 생성 요청.
export class GenerateSimpleOtherIncomeStatementFileDto {
  businessPlace!: ElectronicBusinessPlaceDto;
  paymentYear!: string;
  paymentMonth!: string;
  submitDate?: string;
  recipients!: OtherIncomePaymentRecipientDto[];
}

// 연간 사업소득 지급명세서 생성 요청.
export class GenerateAnnualBusinessIncomeStatementFileDto {
  businessPlace!: ElectronicBusinessPlaceDto;
  attributionYear!: string;
  submitDate?: string;
  fileNamePrefix?: string;
  submissionPeriodCode?: '1' | '2' | '3';
  recipients!: BusinessIncomePaymentRecipientDto[];
}

// 연간 기타소득 지급명세서 생성 요청.
export class GenerateAnnualOtherIncomeStatementFileDto {
  businessPlace!: ElectronicBusinessPlaceDto;
  attributionYear!: string;
  submitDate?: string;
  fileNamePrefix?: string;
  submissionPeriodCode?: '1' | '2' | '3';
  recipients!: OtherIncomePaymentRecipientDto[];
}
