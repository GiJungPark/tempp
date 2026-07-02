export interface KakaoAuthCommand {
  name: string;
  phoneNumber: string;
  birthday: string;
}

export interface HometaxSessionMap {
  userId?: string;
  userNm?: string;
  tin?: string;
  pubcUserNo?: string;
  txprDscmNo?: string;
  txaaYn?: string;
  userClsfCd?: string;
  [key: string]: unknown;
}

export interface HometaxRuntimeSession {
  cookies: Map<string, string>;
  token?: string;
  txId?: string;
  reqTxId?: string;
  cxId?: string;
  authCommand?: KakaoAuthCommand;
  sessionMap?: HometaxSessionMap;
  tehtReady?: boolean;
}

export function createEmptyHometaxSession(): HometaxRuntimeSession {
  return {
    cookies: new Map<string, string>(),
    tehtReady: false,
  };
}
