import { Injectable } from '@nestjs/common';
import {
  BusinessIncomePaymentRecipientDto,
  ElectronicBusinessPlaceDto,
  GenerateAnnualBusinessIncomeStatementFileDto,
  GenerateAnnualOtherIncomeStatementFileDto,
  GenerateSimpleBusinessIncomeStatementFileDto,
  GenerateSimpleOtherIncomeStatementFileDto,
  GenerateWithholdingTaxFileDto,
  OtherIncomePaymentRecipientDto,
} from '../dto/electronic-filing.dto';
import {
  addMonths,
  FixedWidthWriter,
  GeneratedElectronicFile,
  onlyDigits,
  splitBusinessNoFileName,
  todayYmd,
} from '../efile/fixed-width';
import { lookupTaxOfficeCode } from '../efile/tax-office-lookup';

// 소득자 한 명/한 레코드에 대해 계산한 금액 묶음이다.
// 전자파일은 세전금액, 소득세, 지방소득세, 합계를 여러 레코드에서 반복 사용하므로 한 번 계산해 둔다.
interface CalculatedIncome {
  grossAmount: number;
  incomeAmount: number;
  necessaryExpense: number;
  incomeTax: number;
  localIncomeTax: number;
  totalTax: number;
  paymentCount: number;
}

@Injectable()
export class ElectronicFilingFileService {
  // 고정폭/CP949/레코드 길이 검증을 담당하는 helper다.
  private readonly fw = new FixedWidthWriter();

  // 원천징수이행상황신고서 전자파일 생성.
  // 현재 MVP는 기본 신고에 필요한 21(Header), 22(환급세액 조정), 23(원천징수 명세)만 만든다.
  generateWithholdingTax(dto: GenerateWithholdingTaxFileDto): GeneratedElectronicFile {
    // 사업장 정보는 모든 전자파일의 기준이다. 세무서코드가 없으면 주소 기반으로 추정한다.
    const business = this.requireBusinessPlace(dto.businessPlace);
    // 지급연월은 사용자가 선택한 월이고, 제출연월 기본값은 지급연월 + 1이다.
    const paymentYm = this.fw.ym(dto.paymentYm);
    const submitYm = this.fw.ym(dto.submitYm ?? addMonths(paymentYm, 1));
    // 원천세 Header에는 귀속연월이 하나만 들어간다. 별도 입력이 없으면 첫 소득자 귀속월 또는 지급월을 쓴다.
    const attributionYm = this.fw.ym(dto.attributionYm ?? this.firstAttributionYm(dto) ?? paymentYm);
    const writtenDate = this.fw.ymd(dto.writtenDate ?? todayYmd());
    const reportDetailCode = dto.reportDetailCode ?? '01';

    // 사업소득/기타소득 소득자별 입력을 원천세 신고용 금액으로 계산한다.
    const businessRows = (dto.businessIncomeRecipients ?? []).map((row) => this.calculateBusinessIncome(row));
    const otherRows = (dto.otherIncomeRecipients ?? []).map((row) => this.calculateOtherIncome(row));
    const incomeRecords: string[] = [];

    // 23 레코드는 원천징수소득코드별로 반복된다.
    // 예: 사업소득 본세 A25, 사업소득 가감계 A30, 기타소득 본세 A42, 기타소득 가감계 A40.
    const addIncomeRecord = (incomeCode: string, rows: CalculatedIncome[]) => {
      if (rows.length === 0) {
        return;
      }
      // 현재는 소득자 row 수를 인원수로 본다. 같은 사람의 중복 집계 정책은 추후 도메인 로직에서 조정 가능하다.
      const personCount = rows.length;
      const grossAmount = sum(rows, 'grossAmount');
      const incomeTax = sum(rows, 'incomeTax');
      // 필드 순서는 docs/전자자료/원천세/원천세 신고 전산매체.md의 23 레코드 순서와 동일하다.
      const record = this.fw.record('23', 150, [
        this.fw.char('23', 2),
        this.fw.char('C103900', 7),
        this.fw.char(incomeCode, 3),
        this.fw.number(personCount, 15),
        this.fw.number(grossAmount, 15),
        this.fw.number(incomeTax, 15, { allowNegative: true }),
        this.fw.number(0, 15),
        this.fw.number(0, 15),
        this.fw.number(0, 15, { allowNegative: true }),
        this.fw.number(incomeTax, 15),
        this.fw.number(0, 15),
        this.fw.char('', 18),
      ]);
      incomeRecords.push(record);
    };

    addIncomeRecord('A25', businessRows);
    addIncomeRecord('A30', businessRows);
    addIncomeRecord('A42', otherRows);
    addIncomeRecord('A40', otherRows);

    // 21 Header 레코드. 신고서 전체의 사업장/신고월/플래그 정보를 담는다.
    // 대부분의 Y/N 플래그는 MVP 정책상 N으로 둔다. 환급/부표 등은 별도 확장 대상이다.
    const header = this.fw.record('21', 400, [
      this.fw.char('21', 2),
      this.fw.char('C103900', 7),
      this.fw.char(this.fw.businessNo(business.businessNo), 13),
      this.fw.char('14', 2),
      this.fw.char('01', 2),
      this.fw.char(reportDetailCode, 2),
      this.fw.char('F01', 3),
      this.fw.char(attributionYm, 6),
      this.fw.char(paymentYm, 6),
      this.fw.char(submitYm, 6),
      this.fw.char(business.hometaxId, 20),
      this.fw.char(reportDetailCode === '02' ? 'FF101' : 'FF001', 5),
      this.fw.char('', 10),
      this.fw.char('', 30),
      this.fw.char('', 6),
      this.fw.char('', 14),
      this.fw.char(business.businessName, 30),
      this.fw.char(business.address ?? '', 70),
      this.fw.char(business.phone ?? '', 14),
      this.fw.char(business.email ?? '', 50),
      this.fw.char(business.representativeName, 30),
      this.fw.char('01', 2),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('N', 1),
      this.fw.char('', 3),
      this.fw.char('', 20),
      this.fw.char(writtenDate, 8),
      this.fw.char('9000', 4),
      this.fw.char('', 27),
    ]);

    // 22 환급세액 조정 레코드. 환급 기능은 아직 지원하지 않으므로 금액 12개를 모두 0으로 채운다.
    const refundAdjustment = this.fw.record('22', 200, [
      this.fw.char('22', 2),
      this.fw.char('C103900', 7),
      ...Array.from({ length: 12 }, () => this.fw.number(0, 15)),
      this.fw.char('', 11),
    ]);

    // 원천세 파일명은 "작성일자 + C103900 + . + 신고구분상세코드" 형식이다.
    const fileName = `${writtenDate}C103900.${reportDetailCode}`;
    return this.fw.toElectronicFile(fileName, [header, refundAdjustment, ...incomeRecords], [
      '원천세는 현재 기본 21/22/23 레코드만 생성합니다. 환급/부표/기납부세액명세서는 별도 확장 대상입니다.',
    ]);
  }

  // 간이지급명세서(거주자의 사업소득) 전자파일 생성.
  // A=자료제출자, B=지급자 집계, C=소득자 상세 순서로 만든다.
  generateSimpleBusinessIncome(dto: GenerateSimpleBusinessIncomeStatementFileDto): GeneratedElectronicFile {
    const business = this.requireBusinessPlace(dto.businessPlace);
    const submitDate = this.fw.ymd(dto.submitDate ?? todayYmd());
    // source는 원본 입력, calc는 계산된 세액/합계다. 둘을 같이 들고 가면 C레코드 작성이 명확해진다.
    const rows = this.requireRows(dto.recipients, 'recipients').map((row) => ({
      source: row,
      calc: this.calculateBusinessIncome(row),
    }));
    // 지급연도/지급월은 사용자가 지급일자를 넣으면 거기서 계산하고, 없으면 귀속연월을 fallback으로 쓴다.
    const paymentYear = this.year(dto.paymentYear ?? this.firstPaymentYear(rows.map((row) => row.source)));
    const paymentMonth = this.month(dto.paymentMonth ?? this.firstPaymentMonth(rows.map((row) => row.source)));
    // 사업소득 간이지급명세서 B10에는 상반기/하반기 지급시기 코드가 있다.
    const paymentHalf = dto.paymentHalf ?? (Number(paymentMonth) <= 6 ? '1' : '2');

    // A 레코드는 여러 전자파일에서 거의 같은 구조라 commonSubmitterRecord로 만든다.
    const a = this.commonSubmitterRecord('A', '50', 170, business, submitDate, 5);
    // B 레코드는 지급자 1명 기준 집계다. 현재 테스트 범위는 제출자=지급자 1명이다.
    const b = this.fw.record('B', 170, [
      this.fw.char('B', 1),
      this.fw.number(50, 2),
      this.fw.char(business.taxOfficeCode, 3),
      this.fw.number(1, 6),
      this.fw.char(business.businessName, 40),
      this.fw.char('', 30),
      this.fw.char(this.fw.businessNo(business.businessNo), 10),
      this.fw.char('', 13),
      this.fw.number(paymentYear, 4),
      this.fw.number(paymentHalf, 1),
      this.fw.number(rows.length, 10),
      this.fw.number(sum(rows.map((r) => r.calc), 'grossAmount'), 13),
      this.fw.number(paymentMonth, 2),
      this.fw.char('', 35),
    ]);

    // C 레코드는 소득자/귀속월/업종코드별 상세다.
    const c = rows.map(({ source, calc }, index) =>
      this.fw.record('C', 170, [
        this.fw.char('C', 1),
        this.fw.number(50, 2),
        this.fw.char(business.taxOfficeCode, 3),
        this.fw.number(index + 1, 7),
        this.fw.char(this.fw.businessNo(business.businessNo), 10),
        this.fw.char(source.industryCode, 6),
        this.fw.char(source.name, 30),
        // 병의원 업종(851101)은 소득자 사업자번호를 10자리 + 공백 3자리로 넣을 수 있다.
        // 그 외에는 주민등록번호/외국인등록번호 등 identityNo를 사용한다.
        this.fw.identityNo(
          source.industryCode === '851101' && source.recipientBusinessNo
            ? `${this.fw.businessNo(source.recipientBusinessNo)}   `
            : source.identityNo,
          13,
        ),
        this.fw.char(source.foreignerYn ?? '1', 1),
        this.fw.char('', 2),
        this.fw.char('', 4),
        this.fw.char(this.year(source.attributionYm.slice(0, 4)), 4),
        this.fw.char('', 4),
        this.fw.number(calc.grossAmount, 13),
        this.fw.number(source.taxRate ?? this.businessTaxRate(source.industryCode), 2),
        this.fw.number(calc.incomeTax, 13),
        this.fw.number(calc.localIncomeTax, 13),
        this.fw.number(this.month(source.attributionYm.slice(4, 6)), 2),
        this.fw.char('', 40),
      ]),
    );

    return this.fw.toElectronicFile(splitBusinessNoFileName('SF', business.businessNo), [a, b, ...c]);
  }

  // 간이지급명세서(거주자의 기타소득) 전자파일 생성.
  // 사업소득과 구조는 같지만 자료구분이 55이고, C 레코드에 소득구분/필요경비/소득금액이 들어간다.
  generateSimpleOtherIncome(dto: GenerateSimpleOtherIncomeStatementFileDto): GeneratedElectronicFile {
    const business = this.requireBusinessPlace(dto.businessPlace);
    const submitDate = this.fw.ymd(dto.submitDate ?? todayYmd());
    // 기타소득은 지급액, 필요경비, 소득금액, 세액을 함께 계산해야 한다.
    const rows = this.requireRows(dto.recipients, 'recipients').map((row) => ({
      source: row,
      calc: this.calculateOtherIncome(row),
    }));
    // 지급연도/지급월은 사용자가 지급일자를 넣으면 거기서 계산하고, 없으면 귀속연월을 fallback으로 쓴다.
    const paymentYear = this.year(dto.paymentYear ?? this.firstPaymentYear(rows.map((row) => row.source)));
    const paymentMonth = this.month(dto.paymentMonth ?? this.firstPaymentMonth(rows.map((row) => row.source)));

    const a = this.commonSubmitterRecord('A', '55', 170, business, submitDate, 5);
    // B 레코드는 C 레코드의 지급액 합계를 검증하기 위한 집계 레코드다.
    const b = this.fw.record('B', 170, [
      this.fw.char('B', 1),
      this.fw.number(55, 2),
      this.fw.char(business.taxOfficeCode, 3),
      this.fw.number(1, 6),
      this.fw.char(business.businessName, 40),
      this.fw.char(this.fw.businessNo(business.businessNo), 10),
      this.fw.number(rows.length, 10),
      this.fw.number(sum(rows.map((r) => r.calc), 'grossAmount'), 13),
      this.fw.number(paymentYear, 4),
      this.fw.number(paymentMonth, 2),
      this.fw.char('', 79),
    ]);

    // C 레코드는 소득자/귀속월/소득구분코드별 상세다.
    const c = rows.map(({ source, calc }, index) => {
      const attributionYm = this.fw.ym(source.attributionYm);
      return this.fw.record('C', 170, [
        this.fw.char('C', 1),
        this.fw.number(55, 2),
        this.fw.char(business.taxOfficeCode, 3),
        this.fw.number(index + 1, 7),
        this.fw.char(this.fw.businessNo(business.businessNo), 10),
        this.fw.number(attributionYm.slice(0, 4), 4),
        this.fw.number(attributionYm.slice(4, 6), 2),
        this.fw.char(source.incomeTypeCode, 2),
        this.fw.char(source.name, 30),
        this.fw.identityNo(source.identityNo, 13),
        this.fw.char(source.foreignerYn ?? '1', 1),
        this.fw.number(calc.paymentCount, 4),
        this.fw.number(calc.grossAmount, 13),
        this.fw.number(calc.necessaryExpense, 13),
        this.fw.number(calc.incomeAmount, 13),
        this.fw.number(source.taxRate ?? 20, 2),
        this.fw.number(calc.incomeTax, 13),
        this.fw.number(calc.localIncomeTax, 13),
        this.fw.char('', 24),
      ]);
    });

    return this.fw.toElectronicFile(splitBusinessNoFileName('SE', business.businessNo), [a, b, ...c]);
  }

  // 연간 사업소득 지급명세서 생성.
  // 간이지급명세서와 달리 모든 레코드가 190 byte이고 자료구분은 24다.
  generateAnnualBusinessIncome(dto: GenerateAnnualBusinessIncomeStatementFileDto): GeneratedElectronicFile {
    const business = this.requireBusinessPlace(dto.businessPlace);
    const submitDate = this.fw.ymd(dto.submitDate ?? todayYmd());
    // 원문상 C 레코드는 소득자별 + 귀속연도별 + 지급연도별 + 업종구분별 + 세율별로 합산한다.
    // 현재 입력은 이미 그 단위로 들어온다고 보고 1 row = 1 C 레코드로 생성한다.
    const rows = this.requireRows(dto.recipients, 'recipients').map((row) => ({
      source: row,
      calc: this.calculateBusinessIncome(row),
    }));
    const attributionYear = this.year(dto.attributionYear ?? this.firstAttributionYear(rows.map((row) => row.source)));

    const a = this.commonSubmitterRecord('A', '24', 190, business, submitDate, 25);
    // B 레코드는 연간 지급건수/총지급액/세액 합계를 담는다.
    const b = this.fw.record('B', 190, [
      this.fw.char('B', 1),
      this.fw.number(24, 2),
      this.fw.char(business.taxOfficeCode, 3),
      this.fw.number(1, 6),
      this.fw.char(this.fw.businessNo(business.businessNo), 10),
      this.fw.char(business.businessName, 30),
      this.fw.number(rows.length, 6),
      this.fw.number(sum(rows.map((r) => r.calc), 'paymentCount'), 10),
      this.fw.number(sum(rows.map((r) => r.calc), 'grossAmount'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'incomeTax'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'localIncomeTax'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'totalTax'), 15),
      this.fw.number(0, 10),
      this.fw.number(0, 15),
      this.fw.number(dto.submissionPeriodCode ?? '1', 1),
      this.fw.char('', 36),
    ]);

    // C 레코드는 소득자별 연간 지급명세다.
    const c = rows.map(({ source, calc }, index) =>
      this.fw.record('C', 190, [
        this.fw.char('C', 1),
        this.fw.number(24, 2),
        this.fw.char(business.taxOfficeCode, 3),
        this.fw.number(index + 1, 7),
        this.fw.char(this.fw.businessNo(business.businessNo), 10),
        this.fw.identityNo(source.identityNo, 13),
        this.fw.char(source.name, 30),
        this.fw.char(source.recipientBusinessNo ? this.fw.businessNo(source.recipientBusinessNo) : '', 10),
        this.fw.char(source.recipientBusinessName ?? '', 30),
        this.fw.number(1, 1),
        this.fw.number(source.foreignerYn ?? '1', 1),
        this.fw.number(source.industryCode, 6),
        this.fw.char(attributionYear, 4),
        this.fw.char((source.paymentDate ? onlyDigits(source.paymentDate).slice(0, 4) : attributionYear), 4),
        this.fw.number(calc.paymentCount, 8),
        this.fw.number(0, 1),
        this.fw.number(calc.grossAmount, 13),
        this.fw.number(source.taxRate ?? this.businessTaxRate(source.industryCode), 2),
        this.fw.number(0, 1),
        this.fw.number(calc.incomeTax, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.localIncomeTax, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.totalTax, 13),
        this.fw.char('', 2),
      ]),
    );

    return this.fw.toElectronicFile(splitBusinessNoFileName(dto.fileNamePrefix ?? 'F', business.businessNo), [a, b, ...c], [
      '사업소득 지급명세서 파일명 prefix는 샘플 기준 F를 사용합니다. 원문 파일명 규칙 확인 후 fileNamePrefix로 override할 수 있습니다.',
    ]);
  }

  // 연간 기타소득 지급명세서 생성.
  // 모든 레코드는 300 byte이고 자료구분은 23이다.
  generateAnnualOtherIncome(dto: GenerateAnnualOtherIncomeStatementFileDto): GeneratedElectronicFile {
    const business = this.requireBusinessPlace(dto.businessPlace);
    const submitDate = this.fw.ymd(dto.submitDate ?? todayYmd());
    const rows = this.requireRows(dto.recipients, 'recipients').map((row) => {
      // 소득구분 64는 서화/골동품 D레코드가 반드시 필요하다. D레코드 구현 전에는 잘못된 파일 생성을 막는다.
      if (row.incomeTypeCode === '64') {
        throw new Error('UNSUPPORTED_RECORD: 기타소득 지급명세서 소득구분 64는 D레코드 구현 후 생성해야 합니다.');
      }
      return {
        source: row,
        calc: this.calculateOtherIncome(row),
      };
    });
    const attributionYear = this.year(dto.attributionYear ?? this.firstAttributionYear(rows.map((row) => row.source)));

    const a = this.commonSubmitterRecord('A', '23', 300, business, submitDate, 135);
    // B 레코드는 C 레코드의 지급건수/총지급액/소득금액/세액 합계를 담는다.
    const b = this.fw.record('B', 300, [
      this.fw.char('B', 1),
      this.fw.number(23, 2),
      this.fw.char(business.taxOfficeCode, 3),
      this.fw.number(1, 6),
      this.fw.char(this.fw.businessNo(business.businessNo), 10),
      this.fw.char(business.businessName, 30),
      this.fw.number(rows.length, 6),
      this.fw.number(sum(rows.map((r) => r.calc), 'paymentCount'), 10),
      this.fw.number(sum(rows.map((r) => r.calc), 'grossAmount'), 15),
      this.fw.number(0, 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'incomeAmount'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'incomeTax'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'localIncomeTax'), 15),
      this.fw.number(sum(rows.map((r) => r.calc), 'totalTax'), 15),
      this.fw.number(dto.submissionPeriodCode ?? '1', 1),
      this.fw.char('', 141),
    ]);

    // C 레코드는 기타소득자별 연간 지급명세다. D레코드가 없는 76/79 같은 일반 인적용역 코드를 우선 지원한다.
    const c = rows.map(({ source, calc }, index) =>
      this.fw.record('C', 300, [
        this.fw.char('C', 1),
        this.fw.number(23, 2),
        this.fw.char(business.taxOfficeCode, 3),
        this.fw.number(index + 1, 6),
        this.fw.char(this.fw.businessNo(business.businessNo), 10),
        this.fw.identityNo(source.identityNo, 13),
        this.fw.char(source.name, 30),
        this.fw.number(1, 1),
        this.fw.number(source.foreignerYn ?? '1', 1),
        this.fw.number(source.incomeTypeCode, 2),
        this.fw.char(attributionYear, 4),
        this.fw.char((source.paymentDate ? onlyDigits(source.paymentDate).slice(0, 4) : attributionYear), 4),
        this.fw.number(calc.paymentCount, 4),
        this.fw.number(0, 1),
        this.fw.number(calc.grossAmount, 13),
        this.fw.number(0, 1),
        this.fw.number(0, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.necessaryExpense, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.incomeAmount, 13),
        this.fw.number(source.taxRate ?? this.otherTaxRate(source.incomeTypeCode), 2),
        this.fw.number(0, 1),
        this.fw.number(calc.incomeTax, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.localIncomeTax, 13),
        this.fw.number(0, 1),
        this.fw.number(calc.totalTax, 13),
        this.fw.char('', 119),
      ]),
    );

    return this.fw.toElectronicFile(splitBusinessNoFileName(dto.fileNamePrefix ?? 'G', business.businessNo), [a, b, ...c], [
      '기타소득 지급명세서 파일명 prefix는 임시 기본값 G입니다. 원문 파일명 규칙 확인 후 fileNamePrefix로 override하세요.',
      '소득구분 64 D레코드는 아직 생성하지 않습니다.',
    ]);
  }

  private commonSubmitterRecord(
    type: 'A',
    dataType: string,
    length: 170 | 190 | 300,
    business: ElectronicBusinessPlaceDto,
    submitDate: string,
    blankTailLength: number,
  ): string {
    // A 레코드는 제출자 정보다. 간이지급명세서/지급명세서 모두 구조가 거의 같고,
    // 마지막 공란 길이만 170/190/300 byte 레코드별로 다르다.
    return this.fw.record(type, length, [
      this.fw.char('A', 1),
      this.fw.number(dataType, 2),
      this.fw.char(business.taxOfficeCode, 3),
      this.fw.char(submitDate, 8),
      this.fw.number(business.submitterType ?? '3', 1),
      this.fw.char(business.taxAgentManagementNo ?? '', 6),
      this.fw.char(business.hometaxId, 20),
      this.fw.char('9000', 4),
      this.fw.char(this.fw.businessNo(business.businessNo), 10),
      this.fw.char(business.businessName, 30),
      this.fw.char(business.managerDepartment ?? '경영', 30),
      this.fw.char(business.managerName ?? business.representativeName, 30),
      this.fw.char(business.managerPhone ?? business.phone ?? '', 15),
      this.fw.number(1, 5),
      this.fw.char('', blankTailLength),
    ]);
  }

  // 사업소득 계산.
  // 세전 입력이면 그대로 쓰고, 세후 입력이면 원천세+지방세를 역산해 세전금액을 구한다.
  private calculateBusinessIncome(row: BusinessIncomePaymentRecipientDto): CalculatedIncome {
    const taxRate = row.taxRate ?? this.businessTaxRate(row.industryCode);
    const grossAmount =
      (row.amountInputType ?? 'gross') === 'gross'
        ? row.amount
        : Math.floor(row.amount / (1 - taxRate / 100 - (taxRate / 100) * 0.1));
    let incomeTax = Math.floor(grossAmount * (taxRate / 100));
    // 소액부징수: 소득자별 원천세가 1,000원 미만이면 0원 처리한다.
    if (incomeTax < 1000) {
      incomeTax = 0;
    }
    const localIncomeTax = Math.floor(incomeTax * 0.1);
    return {
      grossAmount,
      necessaryExpense: 0,
      incomeAmount: grossAmount,
      incomeTax,
      localIncomeTax,
      totalTax: incomeTax + localIncomeTax,
      paymentCount: row.paymentCount ?? 1,
    };
  }

  // 기타소득 계산.
  // 기본 정책은 기획서 기준 76/79 코드 필요경비 60%, 세율 20%다.
  private calculateOtherIncome(row: OtherIncomePaymentRecipientDto): CalculatedIncome {
    const expenseRate = row.necessaryExpenseRate ?? 0.6;
    const taxRate = row.taxRate ?? this.otherTaxRate(row.incomeTypeCode);
    const grossAmount =
      (row.amountInputType ?? 'gross') === 'gross'
        ? row.amount
        : Math.floor(row.amount / (1 - (1 - expenseRate) * (taxRate / 100) * 1.1));
    const necessaryExpense = row.necessaryExpense ?? Math.floor(grossAmount * expenseRate);
    const incomeAmount = grossAmount - necessaryExpense;
    // 과세최저한: 기타소득 소득금액이 5만원 이하이면 원천세/지방세 0원이다.
    let incomeTax = incomeAmount <= 50000 ? 0 : Math.floor(incomeAmount * (taxRate / 100));
    // 과세최저한 이후에도 소액부징수 기준을 한 번 더 적용한다.
    if (incomeTax < 1000) {
      incomeTax = 0;
    }
    const localIncomeTax = Math.floor(incomeTax * 0.1);
    return {
      grossAmount,
      necessaryExpense,
      incomeAmount,
      incomeTax,
      localIncomeTax,
      totalTax: incomeTax + localIncomeTax,
      paymentCount: row.paymentCount ?? 1,
    };
  }

  // 사업소득 업종코드별 기본 세율.
  // 일반 사업소득은 3%, 봉사료수취자(940905)는 5%로 둔다.
  private businessTaxRate(industryCode: string): 3 | 5 | 20 {
    if (industryCode === '940905') {
      return 5;
    }
    return 3;
  }

  // 기타소득 소득구분코드별 기본 세율.
  // 서비스 MVP의 76/79는 여기에 걸리지 않으므로 기본 20%를 사용한다.
  private otherTaxRate(incomeTypeCode: string): 20 | 15 | 0 | 30 {
    if (incomeTypeCode === '63') {
      return 15;
    }
    if (incomeTypeCode === '61' || incomeTypeCode === '68' || incomeTypeCode === '77') {
      return 0;
    }
    return 20;
  }

  // 사업장 정보 필수값을 확인하고, 세무서코드가 없으면 주소로 관할세무서 CSV를 조회한다.
  private requireBusinessPlace(business?: ElectronicBusinessPlaceDto): ElectronicBusinessPlaceDto {
    if (!business) {
      throw new Error('businessPlace가 필요합니다.');
    }
    const taxOfficeCode = business.taxOfficeCode ?? lookupTaxOfficeCode(business.address);
    if (!taxOfficeCode) {
      throw new Error('taxOfficeCode가 필요합니다. businessPlace.taxOfficeCode를 전달하거나 관할구역 CSV로 매칭 가능한 address를 전달하세요.');
    }
    return {
      ...business,
      taxOfficeCode,
    };
  }

  // 소득자 배열은 최소 1건이 있어야 파일을 만들 수 있다.
  private requireRows<T>(rows: T[] | undefined, fieldName: string): T[] {
    if (!rows?.length) {
      throw new Error(`${fieldName}가 1건 이상 필요합니다.`);
    }
    return rows;
  }

  // 원천세 Header 귀속연월 기본값을 정할 때 첫 번째 소득자 귀속월을 찾는다.
  private firstAttributionYm(dto: GenerateWithholdingTaxFileDto): string | undefined {
    return [...(dto.businessIncomeRecipients ?? []), ...(dto.otherIncomeRecipients ?? [])][0]?.attributionYm;
  }

  // 지급일자가 있으면 지급일자의 연도, 없으면 귀속연월의 연도를 사용한다.
  // 사용자는 "지급날짜"와 "귀속연월"만 입력하고, 전산매체의 지급연도는 여기서 파생된다.
  private firstPaymentYear(rows: Array<BusinessIncomePaymentRecipientDto | OtherIncomePaymentRecipientDto>): string {
    const first = this.requireRows(rows, 'recipients')[0];
    return onlyDigits(first.paymentDate ?? first.attributionYm).slice(0, 4);
  }

  // 지급일자가 있으면 지급일자의 월, 없으면 귀속연월의 월을 사용한다.
  // 간이지급명세서 B레코드의 지급월을 사용자에게 별도로 받지 않기 위한 파생값이다.
  private firstPaymentMonth(rows: Array<BusinessIncomePaymentRecipientDto | OtherIncomePaymentRecipientDto>): string {
    const first = this.requireRows(rows, 'recipients')[0];
    const source = onlyDigits(first.paymentDate ?? first.attributionYm);
    return source.length >= 6 ? source.slice(4, 6) : '';
  }

  // 연간 지급명세서 귀속연도 기본값은 첫 번째 소득자 귀속연월에서 가져온다.
  private firstAttributionYear(rows: Array<BusinessIncomePaymentRecipientDto | OtherIncomePaymentRecipientDto>): string {
    return onlyDigits(this.requireRows(rows, 'recipients')[0].attributionYm).slice(0, 4);
  }

  // 4자리 연도 검증 helper.
  private year(value: string): string {
    const normalized = onlyDigits(value);
    if (!/^\d{4}$/.test(normalized)) {
      throw new Error(`INVALID_DATE: ${value}`);
    }
    return normalized;
  }

  // 1~12월 검증 helper. "5"가 들어와도 "05"로 보정한다.
  private month(value: string): string {
    const normalized = onlyDigits(value).padStart(2, '0');
    if (!/^\d{2}$/.test(normalized) || Number(normalized) < 1 || Number(normalized) > 12) {
      throw new Error(`INVALID_DATE: ${value}`);
    }
    return normalized;
  }
}

// 배열에서 특정 숫자 필드만 합산한다. B 레코드 집계 생성에 반복 사용한다.
function sum<T, K extends keyof T>(rows: T[], key: K): number {
  return rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
}
