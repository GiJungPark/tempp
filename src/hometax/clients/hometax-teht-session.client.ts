import { Injectable } from '@nestjs/common';
import { HometaxHttpClient } from './hometax-http.client';
import { HometaxSessionService } from '../services/hometax-session.service';

@Injectable()
export class HometaxTehtSessionClient {
  private readonly hometaxBaseUrl = 'https://hometax.go.kr';
  private readonly tehtBaseUrl = 'https://teht.hometax.go.kr';
  private readonly ssoTokenUrl = '/token.do?query=_xlrCT2AfgQtDvloaQ26M';
  private readonly entryScreenId = 'UTERNAAZ0Z11';

  constructor(
    private readonly http: HometaxHttpClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async ensureTehtSession(): Promise<void> {
    const session = this.sessionService.get();
    if (session.tehtReady) {
      return;
    }

    await this.http.postJson(
      `/permission.do?screenId=${this.entryScreenId}`,
      {},
      { Accept: 'application/json, text/plain, */*' },
      this.tehtBaseUrl,
    );

    const ssoData = await this.http.postJson<Record<string, unknown>>(
      this.ssoTokenUrl,
      {},
      { Accept: 'application/json' },
      this.hometaxBaseUrl,
    );

    await this.http.postJson(
      `/permission.do?screenId=${this.entryScreenId}&domain=hometax.go.kr`,
      {
        ...ssoData,
        popupYn: false,
      },
      { Accept: 'application/json, text/plain, */*' },
      this.tehtBaseUrl,
    );

    session.tehtReady = true;
  }
}
