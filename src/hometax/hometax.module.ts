import { Module } from '@nestjs/common';
import { HometaxAuthController } from './interfaces/hometax-auth.controller';
import { HometaxBusinessPlaceController } from './interfaces/hometax-business-place.controller';
import { HometaxWithholdingTaxController } from './interfaces/hometax-withholding-tax.controller';
import { HometaxAuthService } from './services/hometax-auth.service';
import { HometaxBusinessPlaceService } from './services/hometax-business-place.service';
import { HometaxSessionService } from './services/hometax-session.service';
import { HometaxWithholdingTaxService } from './services/hometax-withholding-tax.service';
import { HometaxHttpClient } from './clients/hometax-http.client';
import { HometaxOacxClient } from './clients/hometax-oacx.client';
import { HometaxPermissionClient } from './clients/hometax-permission.client';
import { HometaxTehtSessionClient } from './clients/hometax-teht-session.client';
import { HometaxUploadClient } from './clients/hometax-upload.client';
import { HometaxWqActionClient } from './clients/hometax-wq-action.client';

@Module({
  controllers: [
    HometaxAuthController,
    HometaxBusinessPlaceController,
    HometaxWithholdingTaxController,
  ],
  providers: [
    HometaxAuthService,
    HometaxBusinessPlaceService,
    HometaxSessionService,
    HometaxWithholdingTaxService,
    HometaxHttpClient,
    HometaxOacxClient,
    HometaxPermissionClient,
    HometaxTehtSessionClient,
    HometaxUploadClient,
    HometaxWqActionClient,
  ],
})
export class HometaxModule {}
