import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createEmptyHometaxSession,
  HometaxRuntimeSession,
  HometaxSessionMap,
} from '../types/hometax-session';

@Injectable()
export class HometaxSessionService {
  private session: HometaxRuntimeSession = createEmptyHometaxSession();

  get(): HometaxRuntimeSession {
    return this.session;
  }

  reset(): HometaxRuntimeSession {
    this.session = createEmptyHometaxSession();
    return this.session;
  }

  cookieHeader(): string {
    return [...this.session.cookies.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  mergeSetCookieHeaders(setCookieHeaders: string[] | undefined): void {
    if (!setCookieHeaders) {
      return;
    }

    for (const setCookie of setCookieHeaders) {
      const cookie = setCookie.split(';')[0];
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const name = cookie.slice(0, separatorIndex);
      const value = cookie.slice(separatorIndex + 1);
      this.session.cookies.set(name, value);
    }
  }

  applyPortalDefaultCookies(): void {
    const defaults: Record<string, string> = {
      'nts_homtax:zoomVal': '100',
      'nts_hometax:pkckeyboard': 'none',
      NTS_LOGIN_SYSTEM_CODE_P: 'TXPP',
      NTS_REQUEST_SYSTEM_CODE_P: 'TXPP',
      gdnpInfr: '',
      naviOpenYn: '',
      naviOpenRfsYn: '',
      naviWrtCmplFlag: '',
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!this.session.cookies.has(key)) {
        this.session.cookies.set(key, value);
      }
    }
  }

  requireSessionMap(): Required<
    Pick<
      HometaxSessionMap,
      'userId' | 'tin' | 'pubcUserNo' | 'txprDscmNo' | 'txaaYn' | 'userClsfCd'
    >
  > &
    HometaxSessionMap {
    const sessionMap = this.session.sessionMap;
    if (!sessionMap) {
      throw new BadRequestException('홈택스 sessionMap이 없습니다. 간편인증 확인을 먼저 완료하세요.');
    }

    const requiredKeys = [
      'userId',
      'tin',
      'pubcUserNo',
      'txprDscmNo',
      'txaaYn',
      'userClsfCd',
    ] as const;

    for (const key of requiredKeys) {
      if (!sessionMap[key]) {
        throw new BadRequestException(`홈택스 sessionMap.${key} 값이 없습니다.`);
      }
    }

    return sessionMap as ReturnType<HometaxSessionService['requireSessionMap']>;
  }
}
