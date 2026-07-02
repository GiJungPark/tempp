import { Injectable } from '@nestjs/common';
import { HometaxOacxClient } from '../clients/hometax-oacx.client';
import { HometaxPermissionClient } from '../clients/hometax-permission.client';
import { HometaxSessionService } from './hometax-session.service';
import { ConfirmSimpleAuthDto, RequestSimpleAuthDto } from '../dto/auth.dto';

@Injectable()
export class HometaxAuthService {
  constructor(
    private readonly oacxClient: HometaxOacxClient,
    private readonly permissionClient: HometaxPermissionClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async requestSimpleAuth(dto: RequestSimpleAuthDto): Promise<unknown> {
    this.sessionService.reset();
    await this.oacxClient.initialize();
    return this.oacxClient.requestKakaoAuth({
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      birthday: dto.birthday,
    });
  }

  async confirmSimpleAuth(dto: ConfirmSimpleAuthDto): Promise<unknown> {
    const result = dto.wait
      ? await this.waitForAuthResult(dto.timeoutSeconds ?? 60)
      : await this.oacxClient.getAuthResult();

    if (result.resultCode !== '200') {
      return result;
    }

    await this.permissionClient.requestPublicLogin();
    await this.permissionClient.requestPostLoginPermission();
    const sessionMap = await this.permissionClient.loadSessionMap();

    return {
      auth: result,
      sessionMap,
    };
  }

  getSessionSummary(): Record<string, unknown> {
    const session = this.sessionService.get();
    return {
      hasToken: Boolean(session.token),
      hasTxId: Boolean(session.txId),
      hasReqTxId: Boolean(session.reqTxId),
      hasCxId: Boolean(session.cxId),
      tehtReady: Boolean(session.tehtReady),
      sessionMap: session.sessionMap,
      cookies: [...session.cookies.keys()],
    };
  }

  reset(): Record<string, unknown> {
    this.sessionService.reset();
    return this.getSessionSummary();
  }

  private async waitForAuthResult(timeoutSeconds: number): Promise<Awaited<ReturnType<HometaxOacxClient['getAuthResult']>>> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastResult: Awaited<ReturnType<HometaxOacxClient['getAuthResult']>> | undefined;

    while (Date.now() < deadline) {
      lastResult = await this.oacxClient.getAuthResult();
      if (lastResult.resultCode === '200') {
        return lastResult;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (lastResult) {
      return lastResult;
    }
    throw new Error('간편인증 확인 타임아웃');
  }
}
