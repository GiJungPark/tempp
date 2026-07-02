import { Module } from '@nestjs/common';
import { DevHometaxAuthController } from './interfaces/hometax-auth.controller';
import { DevHometaxBusinessPlaceController } from './interfaces/hometax-business-place.controller';
import { DevHometaxSimplePaymentStatementController } from './interfaces/hometax-simple-payment-statement.controller';
import { DevHometaxWithholdingTaxController } from './interfaces/hometax-withholding-tax.controller';
import { HometaxHttpClient } from './clients/hometax-http.client';
import { HometaxOacxClient } from './clients/hometax-oacx.client';
import { HometaxPermissionClient } from './clients/hometax-permission.client';
import { HometaxTehtSessionClient } from './clients/hometax-teht-session.client';
import { HometaxUploadClient } from './clients/hometax-upload.client';
import { HometaxWqActionClient } from './clients/hometax-wq-action.client';
import { HometaxAuthService } from './services/hometax-auth.service';
import { HometaxBusinessPlaceService } from './services/hometax-business-place.service';
import { HometaxSessionService } from './services/hometax-session.service';
import { HometaxSimplePaymentStatementService } from './services/hometax-simple-payment-statement.service';
import { HometaxWithholdingTaxService } from './services/hometax-withholding-tax.service';

// 홈택스 화면 스크래핑/연동 모듈.
// 외부 모듈은 이 모듈의 service DTO만 사용하고, 쿠키/OACX/sessionMap/RAON/NTS payload 세부사항은 알지 못하게 한다.
@Module({
  controllers: [
    DevHometaxAuthController,
    DevHometaxBusinessPlaceController,
    DevHometaxSimplePaymentStatementController,
    DevHometaxWithholdingTaxController,
  ],
  providers: [
    HometaxAuthService,
    HometaxBusinessPlaceService,
    HometaxSessionService,
    HometaxSimplePaymentStatementService,
    HometaxWithholdingTaxService,
    HometaxHttpClient,
    HometaxOacxClient,
    HometaxPermissionClient,
    HometaxTehtSessionClient,
    HometaxUploadClient,
    HometaxWqActionClient,
  ],
  // 전자파일 생성 API는 사업장 정보를 홈택스에서 가져와 주입해야 하므로 사업장 조회 service만 export한다.
  // 세션 캐시 역할의 HometaxSessionService는 의도적으로 export하지 않는다.
  exports: [HometaxBusinessPlaceService],
})
export class HometaxScrapingModule {}
