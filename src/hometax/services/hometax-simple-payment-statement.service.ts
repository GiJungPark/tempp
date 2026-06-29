import { Injectable, Logger } from '@nestjs/common';
import {
  SimplePaymentStatementIncomeType,
  ValidateSimplePaymentStatementFileDto,
} from '../dto/simple-payment-statement.dto';
import { HometaxUploadClient, HometaxUploadResult } from '../clients/hometax-upload.client';
import { HometaxWqActionClient } from '../clients/hometax-wq-action.client';
import { HometaxPermissionClient } from '../clients/hometax-permission.client';
import { HometaxSessionService } from './hometax-session.service';
import { encodeBase64 } from '../utils/base64';

interface SimplePaymentStatementProfile {
  incomeType: SimplePaymentStatementIncomeType;
  label: string;
  screenId: string;
  realScreenId: string;
  baseURL: string;
  referer: string;
  uploadTypeCd: string;
  defaults: {
    bsafClCd: string;
    itrfCd: string;
    cvaKndCd: string;
    stmnKndCd: string;
  };
  actions: {
    initialize: string;
    common: string;
    checkInput: string;
    statusBeforeValidation: string;
    loadLimits: string;
    beforeFormatValidation: string;
    requestFormatValidation: string;
    pollValidation: string;
    loadErrorSummary: string;
    loadErrorDetail: string;
  };
}

// 홈택스 간이지급명세서 변환파일 화면은 사업소득/기타소득이 같은 screenId를 공유한다.
// 실제 차이는 지급명세서 종류 코드와 일부 body 값이므로 profile로 분리해두면 액션 순서를 재사용할 수 있다.
interface TransmissionLimits {
  minTrtFleSz: string;
  maxTrtFleSz: string;
  minTrtScnt: string;
  maxTrtScnt: string;
  frVrfTrtScnt: string;
  cntnVrfTrtScnt: string;
  sbmsTrtScnt: string;
}

interface ValidationState {
  trnsPrgrStat?: string;
  fleSbmsCvaId?: string;
  raw: unknown;
}

const SIMPLE_PAYMENT_STATEMENT_REFERER =
  'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=44&tm2lIdx=4401000000&tm3lIdx=4401100000';

const SIMPLE_PAYMENT_STATEMENT_BASE_PROFILE = {
  screenId: 'UWEICAAD15',
  realScreenId: 'UWEICAAD15',
  baseURL: 'https://hometax.go.kr',
  referer: SIMPLE_PAYMENT_STATEMENT_REFERER,
  uploadTypeCd: '02',
  actions: {
    initialize: 'AWEICZAA008R03',
    common: 'ATICMAAA001R99',
    checkInput: 'AWEICZAA008R01',
    statusBeforeValidation: 'ATESFAAA001R07',
    loadLimits: 'ATTCMZAA002R01',
    beforeFormatValidation: 'AWEICZAA008R05',
    requestFormatValidation: 'ATESFAAA001A01',
    pollValidation: 'ATESFAAA001K01',
    loadErrorSummary: 'AWEICAAA022R01',
    loadErrorDetail: 'AWEICAAA022R06',
  },
};

const SIMPLE_PAYMENT_STATEMENT_PROFILES: Record<SimplePaymentStatementIncomeType, SimplePaymentStatementProfile> = {
  'business-income': {
    ...SIMPLE_PAYMENT_STATEMENT_BASE_PROFILE,
    incomeType: 'business-income',
    label: '간이지급명세서(거주자의 사업소득)',
    defaults: {
      bsafClCd: '',
      itrfCd: '',
      cvaKndCd: '',
      stmnKndCd: '',
    },
  },
  'other-income': {
    ...SIMPLE_PAYMENT_STATEMENT_BASE_PROFILE,
    incomeType: 'other-income',
    label: '간이지급명세서(거주자의 기타소득)',
    defaults: {
      bsafClCd: '',
      itrfCd: '',
      cvaKndCd: '',
      stmnKndCd: '',
    },
  },
};

@Injectable()
export class HometaxSimplePaymentStatementService {
  private readonly logger = new Logger(HometaxSimplePaymentStatementService.name);

  constructor(
    private readonly permissionClient: HometaxPermissionClient,
    private readonly uploadClient: HometaxUploadClient,
    private readonly wqActionClient: HometaxWqActionClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  profiles(): unknown {
    return Object.values(SIMPLE_PAYMENT_STATEMENT_PROFILES).map((profile) => ({
      incomeType: profile.incomeType,
      label: profile.label,
      screenId: profile.screenId,
      realScreenId: profile.realScreenId,
      baseURL: profile.baseURL,
      uploadTypeCd: profile.uploadTypeCd,
      actions: profile.actions,
      defaults: profile.defaults,
      note: 'bsafClCd/itrfCd/cvaKndCd/stmnKndCd는 HAR 확인 전까지 body override를 지원합니다.',
    }));
  }

  async validateFile(
    incomeType: SimplePaymentStatementIncomeType,
    file: Express.Multer.File,
    dto: ValidateSimplePaymentStatementFileDto,
  ): Promise<unknown> {
    const profile = SIMPLE_PAYMENT_STATEMENT_PROFILES[incomeType];
    const sessionMap = this.sessionService.requireSessionMap();
    const diagnostics: Record<string, unknown> = {};

    this.logger.log(`simple statement validate start: ${profile.label}, ${file.originalname}, ${file.size} bytes`);

    // 화면 진입 직후 permission/initialize/common action이 호출된다.
    // 일부 action은 검증 성공에 직접 필요하지 않을 수 있지만, 홈택스 화면 세션을 실제 브라우저와 최대한 맞추기 위해 유지한다.
    diagnostics.permission = await this.tryCall('permission', () =>
      this.permissionClient.requestScreenPermission(profile.screenId),
    );

    const request = this.buildValidationRequest(profile, dto, undefined, file.size);
    diagnostics.initialize = await this.tryCall('initialize', () =>
      this.callProfileAction(profile, profile.actions.initialize, request, dto),
    );
    diagnostics.common = await this.tryCall('common', () =>
      this.callProfileAction(profile, profile.actions.common, request, dto),
    );

    // RAONKUpload는 시작 요청, multipart blob 업로드, 완료 요청의 3단계를 내부 client에서 처리한다.
    const upload = await this.uploadClient.uploadElectronicFile(file, {
      baseURL: dto.uploadBaseURL ?? dto.baseURL ?? profile.baseURL,
      referer: dto.referer ?? profile.referer,
      uploadTypeCd: dto.uploadTypeCd ?? profile.uploadTypeCd,
    });

    // ATTCMZAA002R01 응답에는 홈택스가 허용하는 파일 크기와 처리 건수 한도가 들어온다.
    // 값이 비어 있으면 HAR에서 확인한 기본값을 사용한다.
    const limits = this.extractTransmissionLimits(
      await this.callProfileAction(profile, profile.actions.loadLimits, this.buildLimitRequest(profile, dto), dto),
    );

    // 업로드 결과의 서버 경로와 파일명을 body에 넣어 형식검증 action을 호출한다.
    const validationRequest = this.buildValidationRequest(profile, dto, upload, upload.size, limits);
    diagnostics.checkInput = await this.tryCall('checkInput', () =>
      this.callProfileAction(profile, profile.actions.checkInput, validationRequest, dto),
    );
    diagnostics.statusBeforeValidation = await this.tryCall('statusBeforeValidation', () =>
      this.callProfileAction(profile, profile.actions.statusBeforeValidation, this.buildLimitRequest(profile, dto), dto),
    );
    diagnostics.beforeFormatValidation = await this.tryCall('beforeFormatValidation', () =>
      this.callProfileAction(profile, profile.actions.beforeFormatValidation, validationRequest, dto),
    );

    // trnsPrgrStat가 있어야 이후 polling 가능하다. 없으면 요청 body 매핑이 틀린 것이므로 원 raw 응답을 반환한다.
    const formatResponse = await this.callProfileAction(
      profile,
      profile.actions.requestFormatValidation,
      validationRequest,
      dto,
    );
    const formatState = this.extractValidationState(formatResponse);

    if (!formatState.trnsPrgrStat) {
      return {
        status: 'FORMAT_RESPONSE_WITHOUT_STATE',
        message:
          '간이지급명세서 형식검증 응답에서 trnsPrgrStat를 찾지 못했습니다. HAR 기준 코드값 또는 요청 payload 조정이 필요합니다.',
        incomeType,
        profile: this.publicProfile(profile, dto),
        upload,
        request: validationRequest,
        state: formatState,
        diagnostics,
      };
    }

    // trnsPrgrStat 10/20은 처리 중이다. 화면처럼 주기적으로 상태조회 action을 호출한다.
    const finalState = await this.pollUntilNextStep(profile, dto, formatState);
    const status = this.toPublicStatus(finalState.trnsPrgrStat);

    return {
      status,
      incomeType,
      profile: this.publicProfile(profile, dto),
      upload,
      fleSbmsCvaId: finalState.fleSbmsCvaId,
      state: finalState,
      diagnostics,
    };
  }

  private buildLimitRequest(
    profile: SimplePaymentStatementProfile,
    dto: ValidateSimplePaymentStatementFileDto,
  ): Record<string, string> {
    // 한도조회 계열 action은 실제 파일 정보 없이 신고서 종류/업무구분 코드만 요구한다.
    return {
      bsafClCd: dto.bsafClCd ?? profile.defaults.bsafClCd,
      itrfCd: dto.itrfCd ?? profile.defaults.itrfCd,
      cvaKndCd: dto.cvaKndCd ?? profile.defaults.cvaKndCd,
    };
  }

  private buildValidationRequest(
    profile: SimplePaymentStatementProfile,
    dto: ValidateSimplePaymentStatementFileDto,
    upload?: HometaxUploadResult,
    fileSize = 0,
    limits?: TransmissionLimits,
  ): Record<string, unknown> {
    const sessionMap = this.sessionService.requireSessionMap();
    // 간이지급명세서 검증 화면의 지급연월은 UI 입력값이다.
    // 호출자가 생략하면 테스트 편의를 위해 서버 현재 연월을 넣는다.
    const paymentYear = dto.paymentYear ?? String(new Date().getFullYear());
    const paymentMonth = (dto.paymentMonth ?? String(new Date().getMonth() + 1)).padStart(2, '0');
    const filingType = this.filingTypeCode(dto.filingType);

    // wqAction payload는 화면 JS가 만드는 DVO 형태를 그대로 흉내낸다.
    // 빈 문자열도 의미가 있으므로 불필요해 보여도 제거하지 않는다.
    return {
      cvaId: '',
      cntnVrfErrScnt: '',
      trnsPrgrStat: '00',
      systWrkCnclYn: '',
      frVrfNrmlScnt: '',
      frVrfErrScnt: '',
      cntnVrfNrmlScnt: '',
      frVrfTrgtScnt: '',
      fleSbmsCvaId: '',
      bsafClCd: dto.bsafClCd ?? profile.defaults.bsafClCd,
      cntnVrfTrtScnt: limits?.cntnVrfTrtScnt ?? '100',
      cvaKndCd: dto.cvaKndCd ?? profile.defaults.cvaKndCd,
      elctFleVrfCnclTrtRslt: '',
      excpType: '',
      fileSizeList: String(fileSize),
      fleTrmnBrwsKndNm: '',
      fleTrmnMthdCd: '03',
      frVrfBtchCalYn: 'A',
      frVrfTrtScnt: limits?.frVrfTrtScnt ?? '100',
      inputPassword: dto.encryptedPassword ? encodeBase64(dto.encryptedPassword) : '',
      itrfCd: dto.itrfCd ?? profile.defaults.itrfCd,
      maxTrtFleSz: limits?.maxTrtFleSz ?? '20971520',
      maxTrtScnt: limits?.maxTrtScnt ?? '100',
      minTrtFleSz: limits?.minTrtFleSz ?? '1',
      minTrtScnt: limits?.minTrtScnt ?? '1',
      orcFleNm: upload?.uploadName ?? '',
      orcFleRcvnSn: '',
      pubcUserNo: sessionMap.pubcUserNo,
      rtnClCd: filingType,
      rtnClDetailCd: '',
      sbmsTrtScnt: limits?.sbmsTrtScnt ?? '100',
      sbmtTxprRgtNo: sessionMap.txprDscmNo,
      stmnKndCd: dto.stmnKndCd ?? profile.defaults.stmnKndCd,
      storedFileList: upload?.uploadName ?? '',
      tin: sessionMap.tin,
      txaaYn: sessionMap.txaaYn,
      userClsfCd: sessionMap.userClsfCd,
      userId: sessionMap.userId,
      localfileList: upload?.originalName ?? '',
      pmtYr: paymentYear,
      pmtMm: paymentMonth,
      jrsdYr: paymentYear,
      jrsdMm: paymentMonth,
      wrtnYr: paymentYear,
      wrtnMm: paymentMonth,
      incomeType: profile.incomeType,
      statementLabel: profile.label,
      fileAdmDVOList: upload
        ? [
            {
              localFlePth: upload.originalName,
            },
          ]
        : [],
    };
  }

  private callProfileAction(
    profile: SimplePaymentStatementProfile,
    actionId: string,
    payload: unknown,
    dto?: ValidateSimplePaymentStatementFileDto,
  ): Promise<unknown> {
    // HometaxWqActionClient가 NTS payload 암호화와 HMAC suffix 생성을 담당한다.
    this.logger.debug(`${actionId} payload: ${this.responseSummary(payload)}`);
    return this.wqActionClient.call({
      actionId,
      screenId: profile.screenId,
      realScreenId: dto?.realScreenId ?? profile.realScreenId,
      baseURL: dto?.baseURL ?? profile.baseURL,
      referer: dto?.referer ?? profile.referer,
      payload,
    });
  }

  private async tryCall(label: string, call: () => Promise<unknown>): Promise<unknown> {
    // 화면 보정용 action이 실패해도 핵심 검증 흐름을 계속 보기 위해 diagnostic으로만 기록한다.
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${label} failed: ${message}`);
      return { failed: true, message };
    }
  }

  private async pollUntilNextStep(
    profile: SimplePaymentStatementProfile,
    dto: ValidateSimplePaymentStatementFileDto,
    initial: ValidationState,
  ): Promise<ValidationState> {
    let state = initial;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!['10', '20', undefined].includes(state.trnsPrgrStat)) {
        return state;
      }

      this.logger.log(`simple statement poll ${attempt + 1}: state=${state.trnsPrgrStat ?? '(none)'}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const response = await this.callProfileAction(
        profile,
        profile.actions.pollValidation,
        this.buildLimitRequest(profile, dto),
        dto,
      );
      state = this.extractValidationState(response);
    }

    throw new Error('간이지급명세서 전자파일 검증 polling 타임아웃');
  }

  private extractTransmissionLimits(response: unknown): TransmissionLimits {
    // wqActionClient는 action별로 response를 root 또는 response/request에 담을 수 있어 후보 위치를 같이 본다.
    const obj = response as Record<string, unknown>;
    const source = (obj.response ?? obj.request ?? obj) as Record<string, unknown>;
    return {
      minTrtFleSz: this.stringValue(source.minTrtFleSz) ?? '1',
      maxTrtFleSz: this.stringValue(source.maxTrtFleSz) ?? '20971520',
      minTrtScnt: this.stringValue(source.minTrtScnt) ?? '1',
      maxTrtScnt: this.stringValue(source.maxTrtScnt) ?? '100',
      frVrfTrtScnt: this.stringValue(source.frVrfTrtScnt) ?? '100',
      cntnVrfTrtScnt: this.stringValue(source.cntnVrfTrtScnt) ?? '100',
      sbmsTrtScnt: this.stringValue(source.sbmsTrtScnt) ?? '100',
    };
  }

  private extractValidationState(response: unknown): ValidationState {
    // 홈택스 응답은 trnsPrgrStat가 root에 있거나 첫 번째 파일 DVO 안에 들어오는 경우가 있다.
    const obj = response as Record<string, unknown>;
    const source = (obj.response ?? obj.request ?? obj) as Record<string, unknown>;
    const list = obj.orcFleRcvnDVOList as unknown[] | undefined;
    const firstListItem = Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined;

    return {
      trnsPrgrStat: this.stringValue(source.trnsPrgrStat ?? firstListItem?.trnsPrgrStat),
      fleSbmsCvaId: this.stringValue(source.fleSbmsCvaId ?? firstListItem?.fleSbmsCvaId),
      raw: response,
    };
  }

  private publicProfile(
    profile: SimplePaymentStatementProfile,
    dto: ValidateSimplePaymentStatementFileDto,
  ): Record<string, unknown> {
    // 응답에는 어떤 화면/action/profile로 검증했는지 남겨서 HAR와 비교하기 쉽게 한다.
    return {
      incomeType: profile.incomeType,
      label: profile.label,
      screenId: profile.screenId,
      realScreenId: profile.realScreenId,
      baseURL: profile.baseURL,
      uploadTypeCd: dto.uploadTypeCd ?? profile.uploadTypeCd,
      actions: profile.actions,
      codes: this.buildLimitRequest(profile, dto),
      stmnKndCd: dto.stmnKndCd ?? profile.defaults.stmnKndCd,
    };
  }

  private toPublicStatus(trnsPrgrStat?: string): string {
    // 홈택스 진행상태 코드를 API 사용자에게 읽기 쉬운 상태값으로 바꾼다.
    if (trnsPrgrStat === '11') {
      return 'FORMAT_ERROR';
    }
    if (trnsPrgrStat === '12' || trnsPrgrStat === '22') {
      return 'READY_TO_SUBMIT';
    }
    if (trnsPrgrStat === '21') {
      return 'CONTENT_ERROR';
    }
    if (trnsPrgrStat === '23') {
      return 'CONTENT_CANCELLED';
    }
    return 'UNEXPECTED_STATE';
  }

  private filingTypeCode(filingType?: ValidateSimplePaymentStatementFileDto['filingType']): string {
    // 화면의 신고구분 radio 값을 홈택스 코드로 변환한다.
    if (filingType === 'amended') {
      return '02';
    }
    if (filingType === 'late') {
      return '03';
    }
    return '01';
  }

  private responseSummary(response: unknown): string {
    if (typeof response === 'string') {
      return response.replace(/\s+/g, ' ').slice(0, 1200);
    }
    return JSON.stringify(response).slice(0, 1200);
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
