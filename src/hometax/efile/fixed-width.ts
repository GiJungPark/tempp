import iconv from 'iconv-lite';

// 홈택스 전산매체는 한글을 2byte 완성형으로 계산한다.
// Node 문자열 length는 글자 수 기준이라 맞지 않으므로, 실제 파일 byte는 cp949로 계산한다.
export type FixedWidthEncoding = 'cp949';

// generator API가 반환하는 파일 결과 형태다.
// contentBase64는 실제 업로드/저장에 쓸 CP949 파일 byte를 base64로 감싼 값이다.
export interface GeneratedElectronicFile {
  fileName: string;
  encoding: FixedWidthEncoding;
  contentBase64: string;
  textPreview: string;
  records: ElectronicFileRecordSummary[];
  warnings: string[];
}

export interface ElectronicFileRecordSummary {
  index: number;
  type: string;
  byteLength: number;
}

const ENCODING: FixedWidthEncoding = 'cp949';

// 전산매체는 모든 필드가 "고정 길이"다.
// 이 클래스는 CHAR/NUMBER padding, 날짜/사업자번호 검증, 레코드 byte length 검증을 한 곳에서 처리한다.
export class FixedWidthWriter {
  // 문자 필드: 값은 왼쪽부터 넣고 남는 byte는 우측 space로 채운다.
  // 한글은 cp949 기준 2byte가 될 수 있으므로 byteLength로 overflow를 검사한다.
  char(value: unknown, byteLength: number): string {
    const text = value == null ? '' : String(value);
    const bytes = this.byteLength(text);
    if (bytes > byteLength) {
      throw new Error(`FIELD_OVERFLOW: "${text}" is ${bytes} bytes, expected <= ${byteLength}`);
    }
    return text + ' '.repeat(byteLength - bytes);
  }

  // 숫자 필드: 값은 오른쪽 정렬하고 남는 자리는 좌측 0으로 채운다.
  // 대부분 금액/건수는 음수를 허용하지 않지만, 원천세 일부 필드는 음수 가능해서 옵션으로 열어둔다.
  number(value: unknown, length: number, options: { allowNegative?: boolean } = {}): string {
    if (value == null || value === '') {
      return '0'.repeat(length);
    }

    const num = typeof value === 'number' ? value : Number(String(value).replaceAll(',', ''));
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      throw new Error(`INVALID_AMOUNT: ${String(value)}`);
    }
    if (num < 0 && !options.allowNegative) {
      throw new Error(`INVALID_AMOUNT: negative is not allowed (${num})`);
    }

    if (num < 0) {
      const digits = String(Math.abs(num));
      if (digits.length + 1 > length) {
        throw new Error(`FIELD_OVERFLOW: ${num} exceeds ${length}`);
      }
      return '-' + digits.padStart(length - 1, '0');
    }

    const digits = String(num);
    if (digits.length > length) {
      throw new Error(`FIELD_OVERFLOW: ${num} exceeds ${length}`);
    }
    return digits.padStart(length, '0');
  }

  // YYYYMMDD 날짜 문자열 검증. 하이픈이 들어와도 숫자만 뽑아 검사한다.
  ymd(value: string): string {
    const normalized = onlyDigits(value);
    if (!/^\d{8}$/.test(normalized)) {
      throw new Error(`INVALID_DATE: ${value}`);
    }
    return normalized;
  }

  // YYYYMM 연월 문자열 검증. 신고월/귀속월/지급월에 사용한다.
  ym(value: string): string {
    const normalized = onlyDigits(value);
    if (!/^\d{6}$/.test(normalized)) {
      throw new Error(`INVALID_DATE: ${value}`);
    }
    return normalized;
  }

  // 사업자등록번호는 전산매체에서 '-' 없이 숫자 10자리로 수록한다.
  businessNo(value: string): string {
    const normalized = onlyDigits(value);
    if (!/^\d{10}$/.test(normalized)) {
      throw new Error(`INVALID_BUSINESS_NO: ${value}`);
    }
    return normalized;
  }

  // 주민등록번호/외국인등록번호/사업자번호 등 소득자 식별번호 필드.
  // 원문상 13자리보다 짧은 값은 우측 공백 padding이 가능하므로 char()로 최종 처리한다.
  identityNo(value: string, byteLength = 13): string {
    const normalized = String(value ?? '').replace(/[-/\s]/g, '');
    if (!normalized) {
      throw new Error('FIELD_REQUIRED: identityNo');
    }
    return this.char(normalized, byteLength);
  }

  // 하나의 레코드 전체를 만든 뒤 원문 규격의 byte 길이와 정확히 일치하는지 검증한다.
  // 길이가 하나라도 틀리면 홈택스 형식검증에서 바로 탈락하므로 조용히 자르지 않고 에러를 낸다.
  record(type: string, expectedByteLength: number, fields: string[]): string {
    const record = fields.join('');
    const actual = this.byteLength(record);
    if (actual !== expectedByteLength) {
      throw new Error(`RECORD_LENGTH_MISMATCH: ${type} is ${actual} bytes, expected ${expectedByteLength}`);
    }
    return record;
  }

  // cp949로 인코딩했을 때 실제 파일에서 차지하는 byte 길이다.
  byteLength(value: string): number {
    return iconv.encode(value, ENCODING).length;
  }

  // API 응답용 파일 객체를 만든다.
  // 레코드는 CR/LF로 연결하고, 마지막에도 CR/LF를 붙인다. 원문 제출요령의 LINE SEQUENTIAL 규칙 때문이다.
  toElectronicFile(fileName: string, records: string[], warnings: string[] = []): GeneratedElectronicFile {
    const text = records.join('\r\n') + '\r\n';
    const buffer = iconv.encode(text, ENCODING);
    return {
      fileName,
      encoding: ENCODING,
      contentBase64: buffer.toString('base64'),
      textPreview: text,
      records: records.map((record, index) => ({
        index: index + 1,
        type: record.slice(0, 1).match(/[A-Z]/) ? record.slice(0, 1) : record.slice(0, 2),
        byteLength: this.byteLength(record),
      })),
      warnings,
    };
  }
}

// 숫자가 아닌 문자를 제거한다. 날짜/사업자번호/주민번호 normalize에 공통으로 사용한다.
export function onlyDigits(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

// 사업자번호 파일명 생성 전에 '-' 등을 제거한다.
export function compactBusinessNo(value: string): string {
  return onlyDigits(value);
}

// 간이지급명세서 파일명은 "SF1234567.890"처럼 사업자번호 앞 7자리와 뒤 3자리를 점으로 나눈다.
// 지급명세서도 같은 형태의 prefix + 사업자번호 파일명을 쓰도록 공통화했다.
export function splitBusinessNoFileName(prefix: string, businessNo: string): string {
  const normalized = compactBusinessNo(businessNo);
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error(`INVALID_BUSINESS_NO: ${businessNo}`);
  }
  return `${prefix}${normalized.slice(0, 7)}.${normalized.slice(7)}`;
}

// YYYYMM에 월을 더한다. 원천세 제출연월 기본값(paymentYm + 1)을 만들 때 사용한다.
export function addMonths(ym: string, months: number): string {
  const normalized = onlyDigits(ym);
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error(`INVALID_DATE: ${ym}`);
  }
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 작성일자 기본값. 서버 로컬 날짜 기준 YYYYMMDD다.
export function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}
