---
aliases:
  - 간이지급명세서 API 분석
  - 홈택스 간이지급명세서 전자파일 제출 분석
tags:
  - hometax
  - scraping
  - simple-payment-statement
  - raonk
---

# 홈택스 간이지급명세서 전자파일 제출 분석

관련 문서: [[docs/스크래핑/index|스크래핑 인덱스]], [[docs/스크래핑/홈택스 스크래핑 구현 스펙]], [[docs/전자자료/간이지급명세서/index|간이지급명세서 전자자료 인덱스]]

## 목적

사업소득 / 기타소득 간이지급명세서를 홈택스 UI 자동화 없이 API 요청만으로 전자파일 제출한다.

기존 원천세 전자신고 구현에서 확보한 공통 요소를 최대한 재사용한다.

- 간편인증 세션
- 홈택스 `wqAction.do` NTS payload 서명
- RAONKUpload 기반 파일 업로드
- 전자파일 형식검증 / 상태조회 / 제출 상태 머신

## 공식 제출 기준

국세청 안내 기준:

- 간이지급명세서(거주자의 사업소득): 소득지급일이 속하는 달의 다음달 말일까지 제출, 매월 제출
- 간이지급명세서(거주자의 기타소득): 2024년 1월 지급분부터 매월 제출, 소득지급일이 속하는 달의 다음달 말일까지 제출
- 기타소득 간이지급명세서는 모든 기타소득이 아니라 인적용역 관련 기타소득, 예: 강연료, 자문료 등 소득세법 제21조 제1항 제19호 성격을 대상으로 본다.

홈택스 바로가기:

```text
https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=44&tm2lIdx=4401000000&tm3lIdx=4401100000
```

사용자가 실제로 공유한 진입 URL:

```text
https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=search&searchInfo2573380311
```

이 URL은 변환파일 제출 화면 자체가 아니라 홈택스 통합검색 결과 상태를 복원하는 링크다. `/ui/pp/b/a/UTXPPBAC96.xml` 검색 화면에서 `WebSquare.session.setAttribute("searchInfo" + random, dma_search_param)`로 검색조건을 세션에 저장하고, 검색 결과 클릭 시 `MENU_ID`로 `$c.pp.goPotMenu(menuId)`를 호출한다. 따라서 이 URL만으로는 최종 업무 화면 `scrnUrlPth`를 확정할 수 없고, 검색 결과 row의 `MENU_ID` 또는 클릭 직후 네트워크/HAR가 필요하다.

공개 안내의 메뉴명은 다음 계열이다.

```text
지급명세서·자료제출·공익법인
-> (일용·간이·용역) 소득자료 제출
-> (일용·간이·용역) 변환파일 제출
```

## 실제 화면 캡처 기반 확인

사용자 캡처 기준 실제 업무 화면은 아래다.

```text
화면명: 일용·간이지급명세서 / 사업장제공자 등의 과세자료 제출명세서 제출 (매월·반기)
탭: 변환파일 제출
screenId: UWEICAAD15
```

따라서 최초 추정했던 원천세 계열 `UTERN...` 화면은 이 업무에는 맞지 않는다. `tmIdx=44...`는 공개 안내의 포털 바로가기 후보일 뿐이고, 실제 변환파일 제출 화면/action은 `UWEICAAD15` / `AWEIC...` / `ATESF...` 계열로 봐야 한다.

### 진입 직후 네트워크

캡처에서 확인된 최초 진입 요청:

```text
permission.do?screenId=UWEICAAD15
userAthEvtxMenuUtil
wqAction.do?actionId=ATXPPCBA001R020&screenId=index_pp
wqAction.do?actionId=AWEICZAA008R03&screenId=UWEICAAD15
wqAction.do?actionId=ATICMAAA001R99&screenId=UWEICAAD15
```

역할 추정:

- `AWEICZAA008R03`: 화면 초기화 / 지급명세서 선택 목록 또는 기본 제출자 정보 조회 후보
- `ATICMAAA001R99`: 공통 세션/코드/권한성 조회 후보

### 파일 선택 후 파일검증 시작

캡처에서 확인된 파일검증 관련 요청:

```text
wqAction.do?actionId=AWEICZAA008R01&screenId=UWEICAAD15
wqAction.do?actionId=ATESFAAA001R07&screenId=UWEICAAD15
wqAction.do?actionId=ATTCMZAA002R01&screenId=UWEICAAD15
wqAction.do?actionId=AWEICZAA008R05&screenId=UWEICAAD15
wqAction.do?actionId=ATESFAAA001A01&screenId=UWEICAAD15
wqAction.do?actionId=ATESFAAA001K01&screenId=UWEICAAD15
wqAction.do?actionId=ATESFAAA001K01&screenId=UWEICAAD15
wqAction.do?actionId=AWEICAAA022R01&screenId=UWEICAAD15
wqAction.do?actionId=AWEICAAA022R06&screenId=UWEICAAD15
```

역할 추정:

- `AWEICZAA008R01`: 선택한 지급명세서/제출구분/귀속월 검증 또는 제출자 기본정보 확인 후보
- `ATESFAAA001R07`: 전자파일 처리 상태 조회 후보
- `ATTCMZAA002R01`: 원천세 때와 같은 전자파일 처리 제한값 조회 공통 action 후보
- `AWEICZAA008R05`: 파일검증 전 업무별 사전검증 후보
- `ATESFAAA001A01`: 파일 형식검증 시작 후보
- `ATESFAAA001K01`: 검증 결과/오류 집계 조회 또는 polling 후보
- `AWEICAAA022R01`, `AWEICAAA022R06`: 오류 결과 상세/제출대상 목록 조회 후보

캡처상 선택한 지급명세서는 `간이지급명세서(거주자의 기타소득)`이고, 파일명은 원천세 테스트 파일과 같은 `20260213C103900.01`이다. 따라서 화면에서 “형식에 맞지 않은 오류 자료”가 나온 것은 정상적인 mismatch일 가능성이 높다.

## 현재까지 확인한 홈택스 메뉴 구조

`/ui/pp/header2.xml` 기준으로 포털 메뉴는 아래 action으로 실제 화면 경로를 조회한다.

```text
actionId: ATXPPCBA001R17
screenId: index_pp
out: pubcPotlMenuAdmDVOList[].scrnUrlPth
```

입력은 `dma_search_sMenu`를 `search` 타입으로 매핑하므로, 원천세 A01과 마찬가지로 `request: {...}` 래핑 없이 JSON 최상위 필드로 펼쳐진다.

주요 입력 후보:

```json
{
  "cncClCd": "01",
  "srvcClCd": "01",
  "menuHtrnId": "44",
  "menuId": "4401100000",
  "ntplAthYn": "Y",
  "ntplBmanAthYn": "N",
  "crpBmanAthYn": "N",
  "txaaYn": "N",
  "pubcUserNo": "100000000017241052",
  "dprtUserYn": "N",
  "athCd": "Y",
  "befMenuYn": "Y"
}
```

로그인 없는 상태에서 같은 action을 호출하면 `result=S`여도 `pubcPotlMenuAdmDVOList=[]`가 내려온다. 또한 `menuCd=search&searchInfo...` 진입은 통합검색 화면을 거치므로, 실제 화면 URL과 권한값은 로그인 세션에서 검색 결과 클릭 직후 다시 캡처해야 한다.

## 원천세 구현에서 재사용 가능한 부분

### 재사용 가능

- `HometaxAuthService`: 간편인증 요청 / 확인
- `HometaxSessionService`: 현재는 1인 테스트용 싱글톤 세션
- `HometaxWqActionClient`: NTS HMAC payload 부착
- `HometaxUploadClient`: RAONKUpload `c01 -> c02 multipart -> c03`
- `raonk-upload.ts`: RAON 응답 인코딩/디코딩

### 일반화 필요

현재 원천세 서비스는 아래 값들이 하드코딩되어 있다. 이 값들은 원천세 전자신고 화면 전용값이므로 간이지급명세서에 그대로 재사용하면 안 된다.

```text
screenId: UTERNAAZ0Z11
realScreenId: UTERNAA0Z044
bsafClCd: 004
itrfCd: 14
cvaKndCd: FF000
submit screenId: UTERNAAZ48
```

스크린샷 기준 간이지급명세서 변환파일 제출 화면은 아래 계열이다.

```text
screenId: UWEICAAD15
검증 후보 actionId: ATESFAAA001A01
검증 결과 후보 actionId: ATESFAAA001K01
화면/명세서 정보 후보 actionId: AWEICZAA008R01/R03/R05
오류/대상 조회 후보 actionId: AWEICAAA022R01/R06
```

아래 값은 아직 HAR 또는 화면 JS로 확정해야 한다.

```text
realScreenId
bsafClCd
itrfCd
cvaKndCd
uploadTypeCd
검증 actionId
제출대상 조회 actionId
최종 제출 actionId
```

## 예상 API 흐름

원천세와 동일한 형태로 구현하되, profile을 분리한다.

```text
POST /hometax/auth/request
POST /hometax/auth/confirm

GET  /hometax/simple-payment-statements/profiles

POST /hometax/simple-payment-statements/business-income/validate
POST /hometax/simple-payment-statements/other-income/validate

GET  /hometax/simple-payment-statements/submit-targets?fleSbmsCvaId=...

POST /hometax/simple-payment-statements/submit
body: { fleSbmsCvaId, incomeType, confirmSubmit: true }
```

`business-income`과 `other-income`은 파일 포맷과 전자파일 종류만 다르고, 업로드/검증/상태조회/제출 상태 머신은 공통 서비스로 묶는 편이 좋다.

## 현재 구현된 API

2026-06-27 기준 NestJS에 아래 API를 추가했다.

```text
GET  /hometax/simple-payment-statements/profiles

POST /hometax/simple-payment-statements/business-income/validate
POST /hometax/simple-payment-statements/other-income/validate
```

호출 예:

```bash
curl -X POST http://localhost:3000/hometax/simple-payment-statements/other-income/validate \
  -F 'file=@/path/to/simple-statement-file.01' \
  -F 'paymentYear=2026' \
  -F 'paymentMonth=05'
```

HAR에서 업무별 코드값이 확인되면 같은 API에 아래 필드를 추가해서 즉시 override할 수 있게 했다.

```bash
-F 'bsafClCd=...' \
-F 'itrfCd=...' \
-F 'cvaKndCd=...' \
-F 'stmnKndCd=...' \
-F 'baseURL=https://hometax.go.kr' \
-F 'uploadBaseURL=https://hometax.go.kr' \
-F 'realScreenId=UWEICAAD15'
```

현재 구현은 화면 캡처에서 확인된 `UWEICAAD15` / `ATESFAAA001A01` / `ATESFAAA001K01` 계열을 사용한다. 다만 `bsafClCd`, `itrfCd`, `cvaKndCd`, `stmnKndCd`는 캡처만으로 확정할 수 없어 기본값을 비워뒀다. 따라서 최초 호출은 `FORMAT_RESPONSE_WITHOUT_STATE` 또는 홈택스 입력값 오류가 나올 수 있고, 이 경우 응답의 `request`, `profile`, `diagnostics`를 보고 HAR 기준 코드값을 채워 재호출해야 한다.

## 전자파일 생성 로직

현재 레포에는 간이지급명세서 전자파일 생성 로직이 없다.

다만 사업소득/기타소득 간이지급명세서 전산매체 원문은 `source/전산매체`에 확보했고, 구현 기준 문서는 아래로 정리했다.

- [[docs/전자자료/간이지급명세서/사업소득 간이지급명세서 전산매체]]
- [[docs/전자자료/간이지급명세서/기타소득 간이지급명세서 전산매체]]
- [[docs/전자자료/공통 전자파일 생성 규칙]]

필요 작업:

- 업무별 문서를 기준으로 고정폭 파일 generator 구현
- 레코드 타입, 전체 길이, 숫자 zero-padding, 문자 공백 padding 검증
- CP949/MS949 byte length 검증
- 지급자 합계 레코드와 소득자 상세 레코드 검증
- 주민등록번호/외국인등록번호/사업자번호 체크
- 업종코드, 소득구분코드, 세율/세액 계산 검증
- 생성 파일을 바로 validate로 넘기는 API 추가

## 구현 설계 제안

### 1. 전자파일 변환 profile

```ts
type SimpleStatementIncomeType = 'BUSINESS' | 'OTHER';

interface HometaxConversionProfile {
  incomeType: SimpleStatementIncomeType;
  menu: {
    tmIdx: string;
    tm2lIdx: string;
    tm3lIdx: string;
  };
  screenId: string;
  realScreenId: string;
  uploadTypeCd: string;
  bsafClCd: string;
  itrfCd: string;
  cvaKndCd: string;
  actions: {
    loadLimits: string;
    requestFormatValidation: string;
    requestContentValidation: string;
    pollStatus: string;
    loadSubmitTargets: string;
    submit: string;
  };
}
```

원천세도 이 profile 방식으로 옮기면 `WithholdingTaxService`와 간이지급명세서 서비스의 중복을 줄일 수 있다.

### 2. 공통 전자파일 제출 서비스

```text
ElectronicFilingService
  ensureSession(profile)
  loadTransmissionLimits(profile)
  uploadFile(profile, file)
  requestFormatValidation(profile, upload)
  poll(profile)
  requestContentValidation(profile)
  loadSubmitTargets(profile, fleSbmsCvaId)
  submit(profile, fleSbmsCvaId)
```

### 3. 소득별 파일 generator

```text
BusinessIncomeSimpleStatementFileGenerator
OtherIncomeSimpleStatementFileGenerator
```

generator는 홈택스 API와 분리해서 순수 함수에 가깝게 둔다. 그래야 파일 단위 fixture 테스트가 쉽다.

## 캡처해야 할 HAR

실제 구현 확정을 위해서는 사업소득/기타소득 각각 한 번씩 아래 흐름의 HAR가 필요하다.

1. 메뉴 진입
2. 변환파일 제출 화면 로드
3. 파일 선택
4. 파일검증 또는 변환검증 클릭
5. 검증 상태 polling
6. 제출대상 조회
7. 최종 제출 직전 payload

주의: 최종 제출은 실제 신고가 될 수 있으므로 HAR 캡처 때는 제출 버튼 직전까지만 확인하거나 테스트 계정/무효 파일로 진행한다.

확인할 포인트:

- 화면 XML 경로
- 화면 JS `scwin.action` mapping
- `fileUploadDownloadNX.do`의 `uploadTypeCd`
- RAON `k00` 구성값
- 검증 요청 payload root 구조
- 상태값 필드명: 원천세의 `trnsPrgrStat`, `fleSbmsCvaId`와 같은지
- 제출 actionId와 `confirmSubmit` 방어에 넣을 필수 필드

## 현재 결론

간이지급명세서도 사용자 관점에서는 원천세처럼 전자파일 변환 제출 흐름이 맞다. 다만 API 관점에서는 원천세의 `UTERNAA0Z044 / ATERNABB...` 세트를 그대로 쓰는 방식이 아니라, `UWEICAAD15 / AWEIC... / ATESF...` 세트로 별도 profile을 만들어야 한다.

사용자가 공유한 `menuCd=search&searchInfo...` 링크는 통합검색/히스토리 상태 URL이라 최종 제출 API 식별에는 부족하다. 실제 제출 화면은 캡처에서 확인된 `UWEICAAD15`이며, 다음 단계는 해당 화면에서 파일 선택부터 검증까지의 HAR/cURL로 `fileUploadDownloadNX.do` 업로드 payload와 `ATESFAAA001A01/K01` 요청 body를 확정하는 것이다. 그 뒤에는 기존 RAON 업로드/검증 상태 머신을 profile 기반으로 일반화해서 사업소득과 기타소득을 붙이는 방향이 가장 안전하다.

## 참고 링크

- 국세청 간이지급명세서(거주자의 사업소득): https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=238925&mi=40349
- 국세청 간이지급명세서(거주자의 기타소득): https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=239031&mi=40677
- 국세청 지급명세서 제출 안내: https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=8631&mi=12242
- 국세청 간이지급명세서 전산매체 제출요령 공지: https://www.nts.go.kr/nts/na/ntt/selectNttInfo.do?mi=2207&nttSn=1295164
