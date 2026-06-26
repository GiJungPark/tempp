import { Injectable } from '@nestjs/common';
import { HometaxPermissionClient } from '../clients/hometax-permission.client';
import { HometaxSessionService } from './hometax-session.service';
import { HometaxWqActionClient } from '../clients/hometax-wq-action.client';

@Injectable()
export class HometaxBusinessPlaceService {
  constructor(
    private readonly permissionClient: HometaxPermissionClient,
    private readonly sessionService: HometaxSessionService,
    private readonly wqActionClient: HometaxWqActionClient,
  ) {}

  async getBusinessPlaces(): Promise<unknown> {
    await this.permissionClient.requestBusinessPlacePermission();
    this.sessionService.requireSessionMap();

    return this.wqActionClient.call({
      actionId: 'ATXPPAAA003R01',
      screenId: 'UTXPPAAA24',
      popupYn: true,
      baseURL: 'https://hometax.go.kr',
      referer: 'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index4',
      payload: {
        scrnId: '',
        tin: '',
      },
    });
  }
}
