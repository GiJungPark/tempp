export type SimplePaymentStatementIncomeType = 'business-income' | 'other-income';

export class ValidateSimplePaymentStatementFileDto {
  paymentYear?: string;
  paymentMonth?: string;
  filingType?: 'regular' | 'amended' | 'late';
  stmnKndCd?: string;
  bsafClCd?: string;
  itrfCd?: string;
  cvaKndCd?: string;
  uploadTypeCd?: string;
  baseURL?: string;
  uploadBaseURL?: string;
  referer?: string;
  realScreenId?: string;
  encryptedPassword?: string;
}
