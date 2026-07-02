import { Injectable } from '@nestjs/common';
import { HometaxHttpClient } from './hometax-http.client';
import { HometaxSessionService } from '../services/hometax-session.service';
import { KakaoAuthCommand } from '../types/hometax-session';
import { encodeBase64 } from '../utils/base64';

interface TransResponse {
  token: string;
  txId: string;
  oacxCode: string;
}

interface ProviderResponse {
  id: string;
  provider_id: string;
}

export interface OacxAuthRequestResponse {
  token: string;
  cxId: string;
  reqTxId: string;
  oacxStatus: string;
  oacxCode: string;
  resultCode: string;
}

export interface OacxAuthResultResponse {
  token?: string;
  cxId?: string;
  reqTxId?: string;
  txId?: string;
  oacxStatus?: string;
  oacxCode?: string;
  resultCode?: string;
  clientMessage?: string;
  provider?: string;
  signedData?: string;
  data?: unknown;
}

@Injectable()
export class HometaxOacxClient {
  private readonly origin = 'https://hometax.go.kr';
  private readonly referer = 'https://hometax.go.kr/oacx/index.jsp';

  constructor(
    private readonly http: HometaxHttpClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async initialize(): Promise<void> {
    this.sessionService.applyPortalDefaultCookies();
    await this.http.getText('/permission.do?screenId=index_pp');
    await this.http.getText('/oacx/esign/config/config.auth.jsp', {
      Referer: this.referer,
    });

    const trans = await this.http.postJson<TransResponse>('/oacx/api/v1.0/trans', { token: '' });
    if (trans.oacxCode !== 'OACX_SUCCESS') {
      throw new Error(`OACX trans 실패: ${trans.oacxCode}`);
    }

    const session = this.sessionService.get();
    session.token = trans.token;
    session.txId = trans.txId;
  }

  async requestKakaoAuth(command: KakaoAuthCommand): Promise<OacxAuthRequestResponse> {
    const session = this.sessionService.get();
    session.authCommand = command;

    const provider = await this.getKakaoProviderId();
    const body = this.createAuthRequest(provider, command);
    const response = await this.http.postJson<OacxAuthRequestResponse>(
      '/oacx/api/v1.0/authen/request',
      body,
      this.oacxHeaders(),
    );

    session.token = response.token;
    session.cxId = response.cxId;
    session.reqTxId = response.reqTxId;

    return response;
  }

  async getAuthResult(): Promise<OacxAuthResultResponse> {
    const session = this.sessionService.get();
    if (!session.authCommand) {
      throw new Error('간편인증 요청 정보가 없습니다. /dev/hometax/auth/request를 먼저 호출하세요.');
    }

    const response = await this.http.postJson<OacxAuthResultResponse>(
      '/oacx/api/v1.0/authen/result',
      this.createAuthResultRequest(session.authCommand),
      this.oacxHeaders(),
    );

    if (response.token) {
      session.token = response.token;
    }
    if (response.reqTxId) {
      session.reqTxId = response.reqTxId;
    }
    if (response.cxId) {
      session.cxId = response.cxId;
    }

    return response;
  }

  private async getKakaoProviderId(): Promise<string> {
    const providers = await this.http.request<ProviderResponse[]>({
      method: 'GET',
      url: '/oacx/api/v1.0/provider/list',
      headers: {
        Accept: 'application/json',
      },
    });

    const provider = providers.find((item) => item.provider_id === 'kakao');
    if (!provider) {
      throw new Error('카카오 간편인증 provider를 찾지 못했습니다.');
    }
    return provider.id;
  }

  private createAuthRequest(provider: string, command: KakaoAuthCommand): Record<string, unknown> {
    const session = this.sessionService.get();
    const phone1 = command.phoneNumber.slice(0, 3);
    const phone2 = command.phoneNumber.slice(3);

    return {
      id: '',
      provider,
      token: this.requireValue(session.token, 'token'),
      txId: this.requireValue(session.txId, 'txId'),
      appInfo: { code: '', path: '', type: '' },
      userInfo: this.createUserInfo(command, phone1, phone2),
      deviceInfo: { code: 'PC', browser: 'WB', os: '', universalLink: false },
      contentInfo: {
        signTarget: '',
        signTargetTycd: 'nonce',
        signType: 'GOV_SIMPLE_AUTH',
        requestTitle: '',
        requestContents: '',
      },
      providerOptionInfo: this.providerOptions(),
      compareCI: false,
    };
  }

  private createAuthResultRequest(command: KakaoAuthCommand): Record<string, unknown> {
    const session = this.sessionService.get();
    const phone1 = command.phoneNumber.slice(0, 3);
    const phone2 = command.phoneNumber.slice(3);

    return {
      providerId: 'kakao',
      providerName: '카카오톡',
      deeplinkUri: '',
      naverAppSchemeUrl: '',
      telcoTxid: '',
      mdlAppHash: '',
      id: '',
      provider: 'kakao_v1.5',
      token: this.requireValue(session.token, 'token'),
      txId: this.requireValue(session.txId, 'txId'),
      cxId: this.requireValue(session.cxId, 'cxId'),
      appInfo: { code: '', path: '', type: '' },
      userInfo: this.createUserInfo(command, phone1, phone2),
      deviceInfo: { code: 'PC', browser: 'WB', os: '', universalLink: false },
      contentInfo: {
        signTarget: '',
        signTargetTycd: 'nonce',
        signType: 'GOV_SIMPLE_AUTH',
        requestTitle: '',
        requestContents: '',
      },
      providerOptionInfo: this.providerOptions(),
      compareCI: false,
      useMdlSsn: false,
    };
  }

  private createUserInfo(command: KakaoAuthCommand, phone1: string, phone2: string): Record<string, unknown> {
    return {
      isMember: false,
      name: encodeBase64(command.name),
      phone: encodeBase64(command.phoneNumber),
      phone1: encodeBase64(phone1),
      phone2: encodeBase64(phone2),
      ssn1: '',
      ssn2: '',
      birthday: encodeBase64(command.birthday),
      privacy: 1,
      policy3: 0,
      policy4: 1,
      terms: 0,
      telcoTycd: null,
      access_token: '',
      token_type: '',
      state: '',
      mtranskeySsn2: null,
    };
  }

  private providerOptions(): Record<string, string> {
    return {
      callbackUrl: '',
      reqCSPhoneNo: '1',
      upmuGb: '',
      isUseTss: 'Y',
      isNotification: 'Y',
      isPASSVerify: 'Y',
      isUserAgreement: 'Y',
    };
  }

  private oacxHeaders(): Record<string, string> {
    return {
      Accept: 'application/json; charset=utf-8',
      Origin: this.origin,
      Referer: this.referer,
    };
  }

  private requireValue(value: string | undefined, name: string): string {
    if (!value) {
      throw new Error(`OACX ${name} 값이 없습니다.`);
    }
    return value;
  }
}
