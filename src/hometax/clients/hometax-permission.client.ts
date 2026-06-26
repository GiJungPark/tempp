import { Injectable } from '@nestjs/common';
import { HometaxHttpClient } from './hometax-http.client';
import { HometaxSessionService } from '../services/hometax-session.service';
import { HometaxSessionMap } from '../types/hometax-session';

interface PermissionResponse {
  resultMsg?: {
    sessionMap?: HometaxSessionMap;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

@Injectable()
export class HometaxPermissionClient {
  private readonly origin = 'https://hometax.go.kr';

  constructor(
    private readonly http: HometaxHttpClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async requestPublicLogin(screenId = 'UTXPPABA01'): Promise<string> {
    const session = this.sessionService.get();
    if (!session.token) {
      throw new Error('간편인증 token이 없습니다.');
    }

    return this.http.postForm(
      '/pubcLogin.do?domain=hometax.go.kr&mainSys=Y',
      this.postLoginPayload(screenId),
      {
        Origin: this.origin,
        Referer: 'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3',
        'X-Requested-With': 'XMLHttpRequest',
      },
    );
  }

  async requestPostLoginPermission(screenId = 'UTXPPABA01'): Promise<PermissionResponse> {
    return this.requestPermission(screenId, this.postLoginPayload(screenId));
  }

  async loadSessionMap(): Promise<HometaxSessionMap> {
    const first = await this.requestPermission('UTXPPAAA10', undefined, true);
    if (first.resultMsg?.sessionMap) {
      this.sessionService.get().sessionMap = first.resultMsg.sessionMap;
      return first.resultMsg.sessionMap;
    }

    const second = await this.requestPermission('UTXPPAAA10', undefined, true);
    if (!second.resultMsg?.sessionMap) {
      throw new Error('홈택스 permission 응답에 sessionMap이 없습니다.');
    }

    this.sessionService.get().sessionMap = second.resultMsg.sessionMap;
    return second.resultMsg.sessionMap;
  }

  async requestBusinessPlacePermission(): Promise<PermissionResponse> {
    return this.requestPermission('UTXPPAAA24', this.postLoginPayload('UTXPPAAA24'));
  }

  private async requestPermission(
    screenId: string,
    form?: Record<string, string>,
    sessionMapCookieMode = false,
  ): Promise<PermissionResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
    };

    if (sessionMapCookieMode) {
      const txpp = this.requireCookie('TXPPsessionID');
      const jsession = this.requireCookie('JSESSIONID');
      headers.Cookie = `TXPPsessionID=${txpp}; JSESSIONID=${jsession}`;
    }

    if (form) {
      const text = await this.http.postForm(`/permission.do?screenId=${screenId}`, form, headers);
      return JSON.parse(text) as PermissionResponse;
    }

    return this.http.postJson<PermissionResponse>(`/permission.do?screenId=${screenId}`, {}, headers);
  }

  private postLoginPayload(screenId: string): Record<string, string> {
    const session = this.sessionService.get();
    return {
      moisCertYn: 'Y',
      newGpinYn: 'Y',
      reqTxId: session.token ?? '',
      ssoStatus: '',
      portalStatus: '',
      scrnId: screenId,
      userScrnRslnXcCnt: '2560',
      userScrnRslnYcCnt: '1440',
    };
  }

  private requireCookie(name: string): string {
    const value = this.sessionService.get().cookies.get(name);
    if (!value) {
      throw new Error(`필수 홈택스 쿠키가 없습니다: ${name}`);
    }
    return value;
  }
}
