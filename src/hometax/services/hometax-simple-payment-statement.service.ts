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

    const upload = await this.uploadClient.uploadElectronicFile(file, {
      baseURL: dto.uploadBaseURL ?? dto.baseURL ?? profile.baseURL,
      referer: dto.referer ?? profile.referer,
      uploadTypeCd: dto.uploadTypeCd ?? profile.uploadTypeCd,
    });

    const limits = this.extractTransmissionLimits(
      await this.callProfileAction(profile, profile.actions.loadLimits, this.buildLimitRequest(profile, dto), dto),
    );

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
    const paymentYear = dto.paymentYear ?? String(new Date().getFullYear());
    const paymentMonth = (dto.paymentMonth ?? String(new Date().getMonth() + 1)).padStart(2, '0');
    const filingType = this.filingTypeCode(dto.filingType);

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
