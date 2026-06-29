import { Module } from '@nestjs/common';
import { HometaxAuthController } from './interfaces/hometax-auth.controller';
import { HometaxBusinessPlaceController } from './interfaces/hometax-business-place.controller';
import { HometaxSimplePaymentStatementController } from './interfaces/hometax-simple-payment-statement.controller';
import { HometaxWithholdingTaxController } from './interfaces/hometax-withholding-tax.controller';
import { ElectronicFilingFileController } from './interfaces/electronic-filing-file.controller';
import { HometaxAuthService } from './services/hometax-auth.service';
import { HometaxBusinessPlaceService } from './services/hometax-business-place.service';
import { HometaxSessionService } from './services/hometax-session.service';
import { HometaxSimplePaymentStatementService } from './services/hometax-simple-payment-statement.service';
import { HometaxWithholdingTaxService } from './services/hometax-withholding-tax.service';
import { ElectronicFilingFileService } from './services/electronic-filing-file.service';
import { HometaxHttpClient } from './clients/hometax-http.client';
import { HometaxOacxClient } from './clients/hometax-oacx.client';
import { HometaxPermissionClient } from './clients/hometax-permission.client';
import { HometaxTehtSessionClient } from './clients/hometax-teht-session.client';
import { HometaxUploadClient } from './clients/hometax-upload.client';
import { HometaxWqActionClient } from './clients/hometax-wq-action.client';

// 홈택스 모듈은 화면 스크래핑 client, 세션 보관 service, 전자파일 generator를 한곳에 묶는다.
// 현재 POC는 테스트 사용자 1명 기준이라 HometaxSessionService 하나가 로그인 쿠키와 sessionMap을 공유한다.
@Module({
  controllers: [
    HometaxAuthController,
    HometaxBusinessPlaceController,
    ElectronicFilingFileController,
    HometaxSimplePaymentStatementController,
    HometaxWithholdingTaxController,
  ],
  providers: [
    HometaxAuthService,
    HometaxBusinessPlaceService,
    ElectronicFilingFileService,
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
})
export class HometaxModule {}
