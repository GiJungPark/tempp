export class ValidateWithholdingTaxFileDto {
  rtnClCd?: string;
  rtnClDetailCd?: string;
  stmnKndCd?: string;
  encryptedPassword?: string;
}

export class SubmitWithholdingTaxDto {
  fleSbmsCvaId!: string;
  confirmSubmit!: boolean;
}
