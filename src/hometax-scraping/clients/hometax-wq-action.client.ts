import { Injectable } from '@nestjs/common';
import { HometaxHttpClient } from './hometax-http.client';
import { HometaxSessionService } from '../services/hometax-session.service';
import { createNtsPayload, stringifyForHometax } from '../utils/nts-payload';

interface WqActionOptions {
  actionId: string;
  screenId: string;
  payload: unknown;
  baseURL?: string;
  popupYn?: boolean;
  realScreenId?: string;
  referer?: string;
}

@Injectable()
export class HometaxWqActionClient {
  constructor(
    private readonly http: HometaxHttpClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async call<T = unknown>(options: WqActionOptions): Promise<T> {
    const userId = this.sessionService.requireSessionMap().userId;
    const reqData = stringifyForHometax(options.payload);
    const body = createNtsPayload(reqData, userId);
    const popupYn = options.popupYn ?? false;
    const realScreenId = options.realScreenId ?? '';
    const url =
      `/wqAction.do?actionId=${options.actionId}` +
      `&screenId=${options.screenId}` +
      `&popupYn=${String(popupYn)}` +
      `&realScreenId=${realScreenId}`;

    return this.http.request<T>({
      method: 'POST',
      url,
      baseURL: options.baseURL ?? 'https://teht.hometax.go.kr',
      data: body,
      rawBody: true,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://hometax.go.kr',
        Referer:
          options.referer ??
          'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=41&tm2lIdx=4106000000&tm3lIdx=4106010000',
      },
    });
  }
}
