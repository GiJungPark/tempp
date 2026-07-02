import { Injectable } from '@nestjs/common';
import { HometaxPermissionClient } from '../clients/hometax-permission.client';
import { HometaxSessionService } from './hometax-session.service';
import { HometaxWqActionClient } from '../clients/hometax-wq-action.client';
import { ElectronicBusinessPlaceDto } from '../../hometax/dto/electronic-filing.dto';

interface FlatBusinessPlaceCandidate {
  key: string;
  value: string;
}

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

  // 전자파일 생성 API는 사용자가 사업장 정보를 직접 넣지 않게 숨겼다.
  // 그래서 생성 직전에 홈택스 사업장 조회 원문에서 전산매체에 필요한 사업장 정보를 최대한 추출한다.
  async getDefaultElectronicBusinessPlace(): Promise<ElectronicBusinessPlaceDto> {
    const sessionMap = this.sessionService.requireSessionMap();
    const response = await this.getBusinessPlaces();
    const values = this.flattenStringValues(response);

    // 홈택스 응답 필드명은 화면/사용자 유형에 따라 달라질 수 있어 key 후보와 값 패턴을 함께 본다.
    const businessNo = this.findBusinessNo(values);
    if (!businessNo) {
      throw new Error(
        '사업장 조회 응답에서 사업자등록번호를 찾지 못했습니다. 홈택스 사업장 정보 조회 응답 구조를 확인하거나 내부 businessPlace 매핑을 보강하세요.',
      );
    }

    const representativeName = this.findByKey(values, /(대표|rprs|repr|txprNm|userNm|성명|납세자명)/i) ?? sessionMap.userNm ?? '';
    const phone =
      this.findByKey(values, /(전화|tel|phone|mpb|mpno|mbl|휴대)/i, (value) => onlyDigits(value).length >= 8) ?? '';
    const taxOfficeCode =
      this.findByKey(values, /(세무서|txof|ogz|jrsd|tax.*office|관할)/i, (value) => /^\d{3}$/.test(onlyDigits(value))) ??
      this.stringValue(sessionMap.txofOgzCd);

    return {
      taxOfficeCode: taxOfficeCode ? onlyDigits(taxOfficeCode) : undefined,
      businessNo,
      hometaxId: this.stringValue(sessionMap.userId) ?? '',
      businessName: this.findByKey(values, /(상호|법인명|trade|bman.*nm|bsnm|entrprs|corp)/i) ?? representativeName,
      representativeName,
      address: this.findByKey(values, /(주소|addr|adrs|road|소재지)/i),
      phone,
      submitterType: '3',
      managerDepartment: '경영',
      managerName: representativeName,
      managerPhone: phone,
    };
  }

  // object/array가 섞인 홈택스 원문 응답을 key path와 string value 목록으로 펼친다.
  private flattenStringValues(input: unknown, prefix = ''): FlatBusinessPlaceCandidate[] {
    if (input === null || input === undefined) {
      return [];
    }

    if (typeof input === 'string' || typeof input === 'number') {
      return [{ key: prefix, value: String(input) }];
    }

    if (Array.isArray(input)) {
      return input.flatMap((item, index) => this.flattenStringValues(item, `${prefix}[${index}]`));
    }

    if (typeof input === 'object') {
      return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) =>
        this.flattenStringValues(value, prefix ? `${prefix}.${key}` : key),
      );
    }

    return [];
  }

  private findBusinessNo(values: FlatBusinessPlaceCandidate[]): string | undefined {
    return this.findByKey(values, /(사업자|bsno|bman|txprRgtNo|business.*no)/i, (value) => {
      const digits = onlyDigits(value);
      return digits.length === 10 && !value.includes('*');
    });
  }

  private findByKey(
    values: FlatBusinessPlaceCandidate[],
    keyPattern: RegExp,
    valueGuard: (value: string) => boolean = (value) => value.trim().length > 0,
  ): string | undefined {
    const found = values.find((item) => keyPattern.test(item.key) && valueGuard(item.value));
    return found?.value.trim();
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}
