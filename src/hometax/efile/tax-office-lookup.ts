import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

// 국세청 "세무서별 관할구역" CSV 한 줄을 코드에서 쓰기 쉬운 객체로 바꾼 형태다.
export interface TaxOfficeArea {
  name: string;
  roadAddress: string;
  zipCode: string;
  phone: string;
  fax: string;
  code: string;
  accountNo: string;
  jurisdiction: string;
}

// 프로젝트 안에 보관한 기준자료 위치.
// 원본 CSV는 CP949라서 fs로 읽은 뒤 iconv-lite로 디코딩한다.
const TAX_OFFICE_CSV_PATH = path.join(
  process.cwd(),
  'source',
  '기준자료',
  '국세청_세무서별_관할구역_20260408.csv',
);

let cachedAreas: TaxOfficeArea[] | undefined;

// 사업장 주소에서 관할 세무서코드를 추정한다.
// 홈택스 사업장 조회 결과에 taxOfficeCode가 있으면 그 값을 우선 쓰고, 없을 때만 이 함수가 보조로 동작한다.
export function lookupTaxOfficeCode(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }

  // 공백/괄호 차이 때문에 매칭이 흔들리지 않도록 주소를 단순 정규화한다.
  const normalizedAddress = normalizeAddress(address);
  // 지방국세청 행은 "서울특별시 전체"처럼 너무 넓어서 개별 세무서 매칭에서는 제외한다.
  const areas = loadTaxOfficeAreas().filter((area) => !area.name.endsWith('지방국세청'));
  let best: { area: TaxOfficeArea; score: number } | undefined;

  for (const area of areas) {
    // 관할구역 문구와 주소가 얼마나 잘 맞는지 점수를 매겨 가장 구체적인 세무서를 고른다.
    const score = scoreJurisdiction(normalizedAddress, area.jurisdiction);
    if (score > 0 && (!best || score > best.score)) {
      best = { area, score };
    }
  }

  return best?.area.code;
}

// CSV를 한 번만 읽고 메모리에 캐시한다. 전자파일 생성 API가 여러 번 호출돼도 매번 파일을 읽지 않게 하기 위함이다.
export function loadTaxOfficeAreas(): TaxOfficeArea[] {
  if (cachedAreas) {
    return cachedAreas;
  }
  if (!fs.existsSync(TAX_OFFICE_CSV_PATH)) {
    cachedAreas = [];
    return cachedAreas;
  }

  // 파일이 CP949라 UTF-8로 읽으면 깨진다.
  const csv = iconv.decode(fs.readFileSync(TAX_OFFICE_CSV_PATH), 'cp949');
  const [, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  cachedAreas = lines.map(parseCsvLine).map((cols) => ({
    name: cols[0] ?? '',
    roadAddress: cols[1] ?? '',
    zipCode: cols[2] ?? '',
    phone: cols[3] ?? '',
    fax: cols[4] ?? '',
    code: cols[5] ?? '',
    accountNo: cols[6] ?? '',
    jurisdiction: cols[7] ?? '',
  }));
  return cachedAreas;
}

// 관할구역은 "서울특별시 강남구 중 신사동, 논현동..."처럼 구/동이 섞여 있다.
// 주소가 관할구역 문장을 직접 포함하면 큰 점수, 토큰 일부만 맞으면 낮은 점수를 준다.
function scoreJurisdiction(normalizedAddress: string, jurisdiction: string): number {
  const normalizedJurisdiction = normalizeAddress(jurisdiction)
    .replace(/\b전체\b/g, '')
    .replace(/\b중\b/g, '');
  const parts = normalizedJurisdiction
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let best = 0;
  for (const part of parts) {
    // "서울특별시 강동구"처럼 관할구역 조각이 주소에 그대로 들어가면 가장 확실한 매칭이다.
    if (normalizedAddress.includes(part)) {
      best = Math.max(best, part.length + 1000);
      continue;
    }

    // "서울특별시 강남구 청담동" 주소와 "서울특별시 강남구 중 ... 청담동"처럼 직접 포함은 안 되지만
    // 시/구/동 토큰이 여럿 맞는 경우도 후보로 인정한다.
    const tokens = part.split(/\s+/).filter(Boolean);
    const matched = tokens.filter((token) => normalizedAddress.includes(token));
    if (matched.length >= 2) {
      best = Math.max(best, matched.join('').length + matched.length * 10);
    }
  }
  return best;
}

// 괄호와 중복 공백만 제거하는 가벼운 주소 정규화다.
function normalizeAddress(value: string): string {
  return value
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 쉼표가 따옴표 안에 들어간 CSV 행을 처리하기 위한 작은 parser다.
// 외부 CSV 라이브러리를 추가하지 않고 기준자료의 단순한 형태만 처리한다.
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === ',' && !inQuote) {
      cols.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cols.push(current);
  return cols;
}
