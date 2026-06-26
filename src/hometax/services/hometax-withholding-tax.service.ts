import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { HometaxTehtSessionClient } from '../clients/hometax-teht-session.client';
import { HometaxUploadClient, HometaxUploadResult } from '../clients/hometax-upload.client';
import { HometaxWqActionClient } from '../clients/hometax-wq-action.client';
import { HometaxSessionService } from './hometax-session.service';
import { SubmitWithholdingTaxDto, ValidateWithholdingTaxFileDto } from '../dto/withholding-tax.dto';
import { encodeBase64 } from '../utils/base64';

interface ValidationState {
  trnsPrgrStat?: string;
  fleSbmsCvaId?: string;
  raw: unknown;
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

@Injectable()
export class HometaxWithholdingTaxService {
  private readonly logger = new Logger(HometaxWithholdingTaxService.name);

  constructor(
    private readonly tehtSessionClient: HometaxTehtSessionClient,
    private readonly uploadClient: HometaxUploadClient,
    private readonly wqActionClient: HometaxWqActionClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async validateFile(file: Express.Multer.File, dto: ValidateWithholdingTaxFileDto): Promise<unknown> {
    this.logger.log(`validateFile start: ${file.originalname}, ${file.size} bytes`);
    this.sessionService.requireSessionMap();

    this.logger.log('ensureTehtSession');
    await this.tehtSessionClient.ensureTehtSession();
    this.logger.log('loadTransmissionLimits');
    const limits = this.extractTransmissionLimits(await this.loadTransmissionLimits());

    this.logger.log('uploadWithholdingFile');
    const upload = await this.uploadClient.uploadWithholdingFile(file);
    this.logger.log(`uploadWithholdingFile done: ${upload.uploadName}`);
    this.logger.log('requestFormatValidation');
    const formatResponse = await this.requestFormatValidation(upload, dto, limits);
    const formatState = this.extractValidationState(formatResponse);
    this.logger.log(`format state: ${formatState.trnsPrgrStat ?? '(none)'}`);
    if (!formatState.trnsPrgrStat) {
      return {
        status: 'FORMAT_RESPONSE_WITHOUT_STATE',
        message: '형식검증 응답에서 trnsPrgrStat를 찾지 못했습니다. uploadName 또는 요청 payload 조정이 필요합니다.',
        upload,
        state: formatState,
      };
    }

    if (formatState.trnsPrgrStat === '11') {
      return { status: 'FORMAT_ERROR', upload, state: formatState };
    }

    const afterFormat = await this.pollUntilNextStep(formatState);
    if (afterFormat.trnsPrgrStat === '11') {
      return { status: 'FORMAT_ERROR', upload, state: afterFormat };
    }
    if (afterFormat.trnsPrgrStat !== '12' && afterFormat.trnsPrgrStat !== '20' && afterFormat.trnsPrgrStat !== '22') {
      return { status: 'UNEXPECTED_STATE', upload, state: afterFormat };
    }

    if (afterFormat.trnsPrgrStat === '12') {
      this.logger.log('requestContentValidation');
      await this.requestContentValidation();
    }

    const finalState =
      afterFormat.trnsPrgrStat === '22' ? afterFormat : await this.pollUntilNextStep(afterFormat);

    if (finalState.trnsPrgrStat === '22') {
      return {
        status: 'READY_TO_SUBMIT',
        upload,
        fleSbmsCvaId: finalState.fleSbmsCvaId,
        state: finalState,
      };
    }

    if (finalState.trnsPrgrStat === '21') {
      return { status: 'CONTENT_ERROR', upload, state: finalState };
    }
    if (finalState.trnsPrgrStat === '23') {
      return { status: 'CONTENT_CANCELLED', upload, state: finalState };
    }

    return { status: 'UNEXPECTED_STATE', upload, state: finalState };
  }

  async submit(dto: SubmitWithholdingTaxDto): Promise<unknown> {
    if (dto.confirmSubmit !== true) {
      throw new Error('실제 제출을 하려면 confirmSubmit=true가 필요합니다.');
    }

    await this.tehtSessionClient.ensureTehtSession();
    await this.loadSubmitTargets(dto.fleSbmsCvaId);

    const sessionMap = this.sessionService.requireSessionMap();
    return this.wqActionClient.call({
      actionId: 'ATERNZZZ001A01',
      screenId: 'UTERNAAZ48',
      baseURL: 'https://teht.hometax.go.kr',
      payload: {
        request: {
          itrfCd: '14',
          stmnWrtMthdCd: '03',
          cvaId: dto.fleSbmsCvaId,
          excpType: '',
          warnGdncCnfrYn: 'N',
          pubcUserNo: sessionMap.pubcUserNo,
          rfndAccApplcYn: 'N',
          rfndAccno: '',
          rfndBusnAccBankCd: '',
          potlStmnWrtCmpl: 'N',
          cntnVrfAddYn: 'N',
          scrnId: 'UTERNAAZ48',
        },
        userReqInfoVO: {
          wData: '',
          nData: '',
          uData: '',
        },
      },
    });
  }

  async loadSubmitTargets(fleSbmsCvaId: string): Promise<unknown> {
    await this.tehtSessionClient.ensureTehtSession();
    return this.wqActionClient.call({
      actionId: 'ATERNABB001R06',
      screenId: 'UTERNAAZ48',
      baseURL: 'https://teht.hometax.go.kr',
      payload: {
        request: {
          fleSbmsCvaId,
        },
        pageInfoVO: {
          pageSize: '10',
          pageNum: '1',
          totalCount: '0',
        },
      },
    });
  }

  private async loadTransmissionLimits(): Promise<unknown> {
    return this.wqActionClient.call({
      actionId: 'ATTCMZAA002R01',
      screenId: 'UTERNAAZ0Z11',
      baseURL: 'https://teht.hometax.go.kr',
      realScreenId: 'UTERNAA0Z044',
      payload: {
        bsafClCd: '004',
        itrfCd: '14',
        cvaKndCd: 'FF000',
      },
    });
  }

  private async requestFormatValidation(
    upload: HometaxUploadResult,
    dto: ValidateWithholdingTaxFileDto,
    limits: TransmissionLimits,
  ): Promise<unknown> {
    const sessionMap = this.sessionService.requireSessionMap();
    const request = {
      cvaId: '',
      cntnVrfErrScnt: '',
      trnsPrgrStat: '00',
      systWrkCnclYn: '',
      frVrfNrmlScnt: '',
      frVrfErrScnt: '',
      cntnVrfNrmlScnt: '',
      frVrfTrgtScnt: '',
      fleSbmsCvaId: '',
      bsafClCd: '004',
      cntnVrfTrtScnt: limits.cntnVrfTrtScnt,
      cvaKndCd: 'FF000',
      elctFleVrfCnclTrtRslt: '',
      excpType: '',
      fileSizeList: String(upload.size),
      fleTrmnBrwsKndNm: '',
      fleTrmnMthdCd: '03',
      frVrfBtchCalYn: 'A',
      frVrfTrtScnt: limits.frVrfTrtScnt,
      inputPassword: dto.encryptedPassword ? encodeBase64(dto.encryptedPassword) : '',
      itrfCd: '14',
      maxTrtFleSz: limits.maxTrtFleSz,
      maxTrtScnt: limits.maxTrtScnt,
      minTrtFleSz: limits.minTrtFleSz,
      minTrtScnt: limits.minTrtScnt,
      orcFleNm: upload.uploadName,
      orcFleRcvnSn: '',
      pubcUserNo: sessionMap.pubcUserNo,
      rtnClCd: dto.rtnClCd ?? '',
      rtnClDetailCd: dto.rtnClDetailCd ?? '',
      sbmsTrtScnt: limits.sbmsTrtScnt,
      sbmtTxprRgtNo: sessionMap.txprDscmNo,
      stmnKndCd: dto.stmnKndCd ?? '',
      storedFileList: upload.uploadName,
      tin: sessionMap.tin,
      txaaYn: sessionMap.txaaYn,
      userClsfCd: sessionMap.userClsfCd,
      userId: sessionMap.userId,
      localfileList: upload.originalName,
    };

    const payload = {
      ...request,
      fileAdmDVOList: [
        {
          localFlePth: upload.originalName,
        },
      ],
    };

    this.logger.debug(`A01 request payload: ${this.responseSummary(payload)}`);

    return this.wqActionClient.call({
      actionId: 'ATERNABB001A01',
      screenId: 'UTERNAAZ0Z11',
      baseURL: 'https://teht.hometax.go.kr',
      realScreenId: 'UTERNAA0Z044',
      payload,
    });
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

  private async requestContentValidation(): Promise<unknown> {
    return this.wqActionClient.call({
      actionId: 'ATERNABB001A02',
      screenId: 'UTERNAAZ0Z11',
      baseURL: 'https://teht.hometax.go.kr',
      realScreenId: 'UTERNAA0Z044',
      payload: {
        bsafClCd: '004',
        itrfCd: '14',
        cvaKndCd: 'FF000',
      },
    });
  }

  private async requestValidationStatus(): Promise<ValidationState> {
    this.logger.log('requestValidationStatus');
    const response = await this.wqActionClient.call({
      actionId: 'ATERNABB001R07',
      screenId: 'UTERNAAZ0Z11',
      baseURL: 'https://teht.hometax.go.kr',
      realScreenId: 'UTERNAA0Z044',
      payload: {
        bsafClCd: '004',
        itrfCd: '14',
        cvaKndCd: 'FF000',
      },
    });
    const state = this.extractValidationState(response);
    if (!state.trnsPrgrStat) {
      this.logger.warn(`validation status without trnsPrgrStat: ${this.responseSummary(response)}`);
    }
    return state;
  }

  private async pollUntilNextStep(initial: ValidationState): Promise<ValidationState> {
    let state = initial;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!['10', '20', undefined].includes(state.trnsPrgrStat)) {
        return state;
      }

      this.logger.log(`poll ${attempt + 1}: state=${state.trnsPrgrStat ?? '(none)'}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      state = await this.requestValidationStatus();
    }

    throw new Error('전자파일 검증 polling 타임아웃');
  }

  private extractValidationState(response: unknown): ValidationState {
    const obj = response as Record<string, unknown>;
    const request = obj.response ?? obj.request ?? obj;
    const requestObj = request as Record<string, unknown>;
    const list = obj.orcFleRcvnDVOList as unknown[] | undefined;
    const firstListItem = Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined;

    return {
      trnsPrgrStat: this.stringValue(requestObj.trnsPrgrStat ?? firstListItem?.trnsPrgrStat),
      fleSbmsCvaId: this.stringValue(requestObj.fleSbmsCvaId ?? firstListItem?.fleSbmsCvaId),
      raw: response,
    };
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
