export class RequestSimpleAuthDto {
  name!: string;
  phoneNumber!: string;
  birthday!: string;
}

export class ConfirmSimpleAuthDto {
  wait?: boolean;
  timeoutSeconds?: number;
}
