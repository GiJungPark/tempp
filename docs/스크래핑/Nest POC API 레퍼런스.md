---
aliases:
  - Nest POC API 레퍼런스
  - 홈택스 POC API 레퍼런스
tags:
  - hometax
  - nestjs
  - api-reference
---

# 홈택스 스크래핑 API 레퍼런스

관련 문서: [[docs/스크래핑/index|스크래핑 인덱스]], [[docs/스크래핑/홈택스 스크래핑 구현 스펙]]

## 목적

현재 NestJS POC에서 구현했거나 분석한 홈택스 API를 기능 단위로 정리한다.

범위:

- 간편인증 로그인
- 홈택스 포털 세션 확인 / 초기화
- 사업장 정보 조회
- 원천세/간이지급명세서/지급명세서 전자파일 생성
- 원천세 전자신고 변환파일 업로드 / 검증 / 제출
- 간이지급명세서(거주자의 사업소득) 변환파일 업로드 / 검증
- 간이지급명세서(거주자의 기타소득) 변환파일 업로드 / 검증
- `wqAction.do` NTS payload 규격
- RAONKUpload 파일 업로드 프로토콜

현재 구현은 테스트 사용자 1명 기준이다. 세션은 사용자별로 분리하지 않고 서버 singleton 메모리 세션 하나에 쿠키, OACX token, 홈택스 `sessionMap`을 이어서 저장한다.

## 공통 전제

### 서버

```bash
npm run start:dev
```

기본 URL:

```text
http://localhost:3000
```

### 세션 순서

대부분의 업무 API는 아래 순서 이후 호출해야 한다.

```text
1. POST /hometax/auth/request
2. 휴대폰 카카오 간편인증 승인
3. POST /hometax/auth/confirm
4. 업무 API 호출
```

`/hometax/auth/confirm` 성공 후 `sessionMap`에 최소 아래 값이 있어야 한다.

```text
userId
tin
pubcUserNo
txprDscmNo
txaaYn
userClsfCd
```

해당 값은 `HometaxSessionService.requireSessionMap()`에서 검증한다.

## 1. 간편인증 요청

### 간편인증 요청 외부 API

```http
POST /hometax/auth/request
Content-Type: application/json
```

요청 body:

```json
{
  "name": "홍길동",
  "phoneNumber": "01012345678",
  "birthday": "19900101"
}
```

필드:

| 필드 | 설명 |
| --- | --- |
| `name` | 인증 대상자 이름 |
| `phoneNumber` | 숫자만 입력한 휴대폰 번호 |
| `birthday` | `YYYYMMDD` 생년월일 |

응답은 홈택스 OACX `authen/request` 응답을 그대로 반환한다.

주요 응답 필드:

| 필드 | 설명 |
| --- | --- |
| `token` | 이후 OACX polling과 홈택스 `pubcLogin`에 사용 |
| `cxId` | OACX 인증 요청 식별자 |
| `reqTxId` | 요청 트랜잭션 ID |
| `oacxStatus` | OACX 상태 |
| `resultCode` | 요청 결과 코드 |

### 간편인증 요청 내부 홈택스 호출 흐름

```text
GET  https://hometax.go.kr/permission.do?screenId=index_pp
GET  https://hometax.go.kr/oacx/esign/config/config.auth.jsp
POST https://hometax.go.kr/oacx/api/v1.0/trans
GET  https://hometax.go.kr/oacx/api/v1.0/provider/list
POST https://hometax.go.kr/oacx/api/v1.0/authen/request
```

`authen/request`에서 사용자 정보는 Base64로 인코딩해서 보낸다.

```json
{
  "userInfo": {
    "name": "base64(name)",
    "phone": "base64(phoneNumber)",
    "phone1": "base64(010)",
    "phone2": "base64(나머지번호)",
    "birthday": "base64(YYYYMMDD)"
  },
  "deviceInfo": {
    "code": "PC",
    "browser": "WB"
  },
  "contentInfo": {
    "signTargetTycd": "nonce",
    "signType": "GOV_SIMPLE_AUTH"
  }
}
```

현재 provider는 `provider_id === "kakao"`인 항목을 찾아 사용한다.

## 2. 간편인증 확인

### 간편인증 확인 외부 API

```http
POST /hometax/auth/confirm
Content-Type: application/json
```

요청 body:

```json
{
  "wait": true,
  "timeoutSeconds": 60
}
```

필드:

| 필드 | 설명 |
| --- | --- |
| `wait` | `true`면 서버가 1초 간격으로 승인 완료까지 polling |
| `timeoutSeconds` | polling timeout. 기본 60초 |

응답:

```json
{
  "auth": {
    "resultCode": "200"
  },
  "sessionMap": {
    "userId": "...",
    "tin": "...",
    "pubcUserNo": "...",
    "txprDscmNo": "...",
    "txaaYn": "...",
    "userClsfCd": "..."
  }
}
```

### 간편인증 확인 내부 홈택스 호출 흐름

```text
POST https://hometax.go.kr/oacx/api/v1.0/authen/result
POST https://hometax.go.kr/pubcLogin.do?domain=hometax.go.kr&mainSys=Y
POST https://hometax.go.kr/permission.do?screenId=UTXPPABA01
POST https://hometax.go.kr/permission.do?screenId=UTXPPAAA10
```

`pubcLogin.do` / `permission.do` payload:

```text
moisCertYn=Y
newGpinYn=Y
reqTxId={OACX token}
ssoStatus=
portalStatus=
scrnId={screenId}
userScrnRslnXcCnt=2560
userScrnRslnYcCnt=1440
```

`UTXPPAAA10` 응답의 `resultMsg.sessionMap`을 서버 세션에 저장한다.

## 3. 세션 확인 / 초기화

### 세션 확인

```http
GET /hometax/auth/session
```

응답:

```json
{
  "hasToken": true,
  "hasTxId": true,
  "hasReqTxId": true,
  "hasCxId": true,
  "tehtReady": false,
  "sessionMap": {},
  "cookies": ["TXPPsessionID", "JSESSIONID"]
}
```

### 세션 초기화

```http
POST /hometax/auth/reset
```

서버 메모리의 쿠키, OACX token, `sessionMap`, TEHT 연결 상태를 모두 비운다.

## 4. 사업장 정보 조회

### 사업장 정보 조회 외부 API

```http
GET /hometax/business-places
```

### 사업장 정보 조회 내부 홈택스 호출

```text
POST https://hometax.go.kr/permission.do?screenId=UTXPPAAA24
POST https://hometax.go.kr/wqAction.do?actionId=ATXPPAAA003R01&screenId=UTXPPAAA24&popupYn=true&realScreenId=
```

`wqAction` payload:

```json
{
  "scrnId": "",
  "tin": ""
}
```

응답은 홈택스 원본 JSON을 그대로 반환한다.

## 5. TEHT 세금신고 도메인 연결

원천세 전자신고는 `teht.hometax.go.kr` 도메인을 사용한다. 포털 로그인 세션만으로는 부족해서 최초 원천세 API 호출 전 아래 흐름을 수행한다.

```text
POST https://teht.hometax.go.kr/permission.do?screenId=UTERNAAZ0Z11
POST https://hometax.go.kr/token.do?query=_xlrCT2AfgQtDvloaQ26M
POST https://teht.hometax.go.kr/permission.do?screenId=UTERNAAZ0Z11&domain=hometax.go.kr
```

두 번째 `permission.do`에는 `token.do` 응답 전체에 `popupYn=false`를 추가해서 보낸다.

완료 후:

```text
session.tehtReady = true
NTS_REQUEST_SYSTEM_CODE_P = TEHT
```

## 6. 원천세 전자신고 파일 검증

### 원천세 파일 검증 외부 API

```http
POST /hometax/withholding-tax/validate
Content-Type: multipart/form-data
```

curl:

```bash
curl -X POST http://localhost:3000/hometax/withholding-tax/validate \
  -F 'file=@/Users/nox/Downloads/20260213C103900.01'
```

선택 필드:

| 필드 | 설명 |
| --- | --- |
| `rtnClCd` | 신고구분 코드. HAR 기준 override용 |
| `rtnClDetailCd` | 신고구분 상세 코드 |
| `stmnKndCd` | 신고서 종류 코드 |
| `encryptedPassword` | 암호 파일인 경우 입력. 내부에서 Base64 인코딩 후 `inputPassword`로 전송 |

### 원천세 파일 검증 내부 흐름

```text
1. TEHT 세션 보장
2. 처리 제한값 조회
3. RAON 업로드 c01/c02/c03
4. 형식검증 요청
5. 상태 polling
6. 필요하면 내용검증 요청
7. 최종 상태 반환
```

### 원천세 profile

```text
baseURL: https://teht.hometax.go.kr
screenId: UTERNAAZ0Z11
realScreenId: UTERNAA0Z044
uploadTypeCd: 02
bsafClCd: 004
itrfCd: 14
cvaKndCd: FF000
```

### 처리 제한값 조회

```text
POST /wqAction.do?actionId=ATTCMZAA002R01&screenId=UTERNAAZ0Z11&popupYn=false&realScreenId=UTERNAA0Z044
```

payload:

```json
{
  "bsafClCd": "004",
  "itrfCd": "14",
  "cvaKndCd": "FF000"
}
```

주요 응답 필드:

```text
minTrtFleSz
maxTrtFleSz
minTrtScnt
maxTrtScnt
frVrfTrtScnt
cntnVrfTrtScnt
sbmsTrtScnt
```

응답에 없으면 현재 구현은 아래 기본값을 사용한다.

```text
minTrtFleSz=1
maxTrtFleSz=20971520
minTrtScnt=1
maxTrtScnt=100
frVrfTrtScnt=100
cntnVrfTrtScnt=100
sbmsTrtScnt=100
```

### 형식검증 요청

```text
POST /wqAction.do?actionId=ATERNABB001A01&screenId=UTERNAAZ0Z11&popupYn=false&realScreenId=UTERNAA0Z044
```

payload 핵심:

```json
{
  "trnsPrgrStat": "00",
  "bsafClCd": "004",
  "cvaKndCd": "FF000",
  "itrfCd": "14",
  "fleTrmnMthdCd": "03",
  "frVrfBtchCalYn": "A",
  "fileSizeList": "1357",
  "orcFleNm": "20260213C103900.01",
  "storedFileList": "20260213C103900.01",
  "localfileList": "20260213C103900.01",
  "pubcUserNo": "{sessionMap.pubcUserNo}",
  "sbmtTxprRgtNo": "{sessionMap.txprDscmNo}",
  "tin": "{sessionMap.tin}",
  "txaaYn": "{sessionMap.txaaYn}",
  "userClsfCd": "{sessionMap.userClsfCd}",
  "userId": "{sessionMap.userId}",
  "fileAdmDVOList": [
    {
      "localFlePth": "20260213C103900.01"
    }
  ]
}
```

주의: 원천세 A01은 화면 JS mapping 기준 `dma_search_s1` 필드를 JSON root에 펼쳐 보내야 했다. `{ "request": { ... } }`로 감싸면 `입력데이터가 올바르지 않습니다`가 내려왔다.

### 상태 조회

```text
POST /wqAction.do?actionId=ATERNABB001R07&screenId=UTERNAAZ0Z11&popupYn=false&realScreenId=UTERNAA0Z044
```

payload:

```json
{
  "bsafClCd": "004",
  "itrfCd": "14",
  "cvaKndCd": "FF000"
}
```

상태값:

| `trnsPrgrStat` | 의미 |
| --- | --- |
| `10` | 형식검증 진행 중 |
| `11` | 형식검증 오류 |
| `12` | 형식검증 정상, 내용검증 가능 |
| `20` | 내용검증 진행 중 |
| `21` | 내용검증 오류 |
| `22` | 제출 가능 |
| `23` | 내용검증 취소 |

### 내용검증 요청

```text
POST /wqAction.do?actionId=ATERNABB001A02&screenId=UTERNAAZ0Z11&popupYn=false&realScreenId=UTERNAA0Z044
```

payload:

```json
{
  "bsafClCd": "004",
  "itrfCd": "14",
  "cvaKndCd": "FF000"
}
```

### 외부 API 응답 상태

| status | 의미 |
| --- | --- |
| `FORMAT_RESPONSE_WITHOUT_STATE` | 형식검증 응답에서 `trnsPrgrStat`를 못 찾음. payload 조정 필요 |
| `FORMAT_ERROR` | 홈택스 형식검증 오류 |
| `READY_TO_SUBMIT` | 제출 가능. `fleSbmsCvaId` 확인 |
| `CONTENT_ERROR` | 내용검증 오류 |
| `CONTENT_CANCELLED` | 내용검증 취소 |
| `UNEXPECTED_STATE` | 정의하지 않은 홈택스 상태 |

## 7. 원천세 제출대상 조회

### 원천세 제출대상 조회 외부 API

```http
GET /hometax/withholding-tax/submit-targets?fleSbmsCvaId={검증ID}
```

### 원천세 제출대상 조회 내부 홈택스 호출

```text
POST /wqAction.do?actionId=ATERNABB001R06&screenId=UTERNAAZ48&popupYn=false&realScreenId=
```

payload:

```json
{
  "request": {
    "fleSbmsCvaId": "..."
  },
  "pageInfoVO": {
    "pageSize": "10",
    "pageNum": "1",
    "totalCount": "0"
  }
}
```

## 8. 원천세 최종 제출

### 원천세 최종 제출 외부 API

```http
POST /hometax/withholding-tax/submit
Content-Type: application/json
```

요청:

```json
{
  "fleSbmsCvaId": "202606910000005258941859",
  "confirmSubmit": true
}
```

`confirmSubmit !== true`면 실제 홈택스 제출 action을 호출하지 않고 에러를 던진다.

### 원천세 최종 제출 내부 홈택스 호출

```text
POST /wqAction.do?actionId=ATERNZZZ001A01&screenId=UTERNAAZ48&popupYn=false&realScreenId=
```

payload:

```json
{
  "request": {
    "itrfCd": "14",
    "stmnWrtMthdCd": "03",
    "cvaId": "{fleSbmsCvaId}",
    "excpType": "",
    "warnGdncCnfrYn": "N",
    "pubcUserNo": "{sessionMap.pubcUserNo}",
    "rfndAccApplcYn": "N",
    "rfndAccno": "",
    "rfndBusnAccBankCd": "",
    "potlStmnWrtCmpl": "N",
    "cntnVrfAddYn": "N",
    "scrnId": "UTERNAAZ48"
  },
  "userReqInfoVO": {
    "wData": "",
    "nData": "",
    "uData": ""
  }
}
```

## 9. 간이지급명세서 profile 조회

### 간이지급명세서 profile 조회 외부 API

```http
GET /hometax/simple-payment-statements/profiles
```

응답에는 현재 구현된 사업소득/기타소득 profile 후보가 나온다.

공통 profile:

```text
baseURL: https://hometax.go.kr
screenId: UWEICAAD15
realScreenId: UWEICAAD15
uploadTypeCd: 02
referer: /websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=44&tm2lIdx=4401000000&tm3lIdx=4401100000
```

캡처 기반 action 후보:

| 역할 | actionId |
| --- | --- |
| 초기화 / 명세서 목록 후보 | `AWEICZAA008R03` |
| 공통 세션/코드 후보 | `ATICMAAA001R99` |
| 입력값 확인 후보 | `AWEICZAA008R01` |
| 검증 전 상태 조회 후보 | `ATESFAAA001R07` |
| 처리 제한값 조회 후보 | `ATTCMZAA002R01` |
| 형식검증 전 사전검증 후보 | `AWEICZAA008R05` |
| 형식검증 시작 후보 | `ATESFAAA001A01` |
| 검증 결과 polling 후보 | `ATESFAAA001K01` |
| 오류 요약 후보 | `AWEICAAA022R01` |
| 오류 상세 후보 | `AWEICAAA022R06` |

아직 HAR로 확정되지 않은 코드:

```text
bsafClCd
itrfCd
cvaKndCd
stmnKndCd
```

## 10. 간이지급명세서(거주자의 사업소득) 파일 검증

### 사업소득 간이지급명세서 검증 외부 API

```http
POST /hometax/simple-payment-statements/business-income/validate
Content-Type: multipart/form-data
```

curl:

```bash
curl -X POST http://localhost:3000/hometax/simple-payment-statements/business-income/validate \
  -F 'file=@/path/to/business-income-file.01' \
  -F 'paymentYear=2026' \
  -F 'paymentMonth=05'
```

override 예:

```bash
curl -X POST http://localhost:3000/hometax/simple-payment-statements/business-income/validate \
  -F 'file=@/path/to/business-income-file.01' \
  -F 'paymentYear=2026' \
  -F 'paymentMonth=05' \
  -F 'bsafClCd=...' \
  -F 'itrfCd=...' \
  -F 'cvaKndCd=...' \
  -F 'stmnKndCd=...'
```

선택 필드:

| 필드 | 기본값 | 설명 |
| --- | --- | --- |
| `paymentYear` | 현재 연도 | 지급연도 |
| `paymentMonth` | 현재 월 | 지급월, 2자리로 보정 |
| `filingType` | `regular` | `regular`, `amended`, `late` |
| `bsafClCd` | 빈 값 | HAR 확인 후 override |
| `itrfCd` | 빈 값 | HAR 확인 후 override |
| `cvaKndCd` | 빈 값 | HAR 확인 후 override |
| `stmnKndCd` | 빈 값 | HAR 확인 후 override |
| `uploadTypeCd` | `02` | RAON 업로드 타입 |
| `baseURL` | `https://hometax.go.kr` | `wqAction.do` 호출 도메인 override |
| `uploadBaseURL` | `baseURL` | RAON 업로드 도메인 override |
| `referer` | tmIdx=44 URL | 홈택스 referer override |
| `realScreenId` | `UWEICAAD15` | `wqAction.do` query override |
| `encryptedPassword` | 빈 값 | 내부에서 Base64 인코딩 후 `inputPassword`로 전송 |

### 사업소득 간이지급명세서 검증 내부 흐름

```text
1. permission.do?screenId=UWEICAAD15
2. AWEICZAA008R03 / ATICMAAA001R99 diagnostic 호출
3. RAON 업로드 c01/c02/c03
4. ATTCMZAA002R01 처리 제한값 조회
5. AWEICZAA008R01 / ATESFAAA001R07 / AWEICZAA008R05 diagnostic 호출
6. ATESFAAA001A01 형식검증 시작
7. ATESFAAA001K01 polling
```

응답에서 `FORMAT_RESPONSE_WITHOUT_STATE`가 나오면 `request`, `profile`, `diagnostics`를 보고 HAR 기준 코드값을 채워 재호출한다.

## 11. 간이지급명세서(거주자의 기타소득) 파일 검증

### 기타소득 간이지급명세서 검증 외부 API

```http
POST /hometax/simple-payment-statements/other-income/validate
Content-Type: multipart/form-data
```

curl:

```bash
curl -X POST http://localhost:3000/hometax/simple-payment-statements/other-income/validate \
  -F 'file=@/path/to/other-income-file.01' \
  -F 'paymentYear=2026' \
  -F 'paymentMonth=05'
```

override 필드는 사업소득과 동일하다.

캡처에서 확인된 실제 화면 선택값:

```text
간이지급명세서(거주자의 기타소득)
screenId=UWEICAAD15
```

원천세 파일을 이 화면에 넣으면 형식 오류가 나는 것이 정상이다. 실제 검증 확인에는 기타소득 간이지급명세서 전산매체 규격에 맞는 파일이 필요하다.

## 12. wqAction.do 공통 규격

### URL

```text
POST {baseURL}/wqAction.do?actionId={ACTION_ID}&screenId={SCREEN_ID}&popupYn={true|false}&realScreenId={REAL_SCREEN_ID}
```

headers:

```text
Accept: application/json
Content-Type: application/json
Origin: https://hometax.go.kr
Referer: {화면 URL}
Cookie: {현재 세션 쿠키}
```

### body 생성

화면 payload를 JSON 문자열로 만든다. 숫자는 문자열로 보정한다.

```ts
const reqData = JSON.stringify(payload, numberToStringReplacer);
```

그 뒤 NTS suffix를 붙인다.

```text
{reqData}<nts<nts>nts>{Number(second) + 11}{hmac}{second}
```

HMAC:

```text
algorithm: sha256
key: testVal[second % testVal.length]
message: reqData + sessionMap.userId
digest: base64
post-process: 영숫자 이외 문자 제거
```

주의:

- WebSquare action mapping이 `search` 타입이면 payload를 root에 펼쳐 보내야 하는 경우가 많다.
- 어떤 action은 `{ request: {...} }` 래핑을 요구한다.
- 최종 기준은 화면 XML/JS action mapping과 HAR다.

## 13. 전자파일 생성 API

전자파일 생성은 홈택스 API 호출과 분리된 순수 generator다. 응답은 CP949/MS949 인코딩 byte를 base64로 반환한다.

`businessPlace.taxOfficeCode`는 직접 전달하면 그 값을 사용한다. 값이 없으면 `source/기준자료/국세청_세무서별_관할구역_20260408.csv`의 `관할구역`을 기준으로 `businessPlace.address`에서 자동 추정한다.

```text
POST /hometax/electronic-files/withholding-tax
POST /hometax/electronic-files/simple-payment-statements/business-income
POST /hometax/electronic-files/simple-payment-statements/other-income
POST /hometax/electronic-files/annual-payment-statements/business-income
POST /hometax/electronic-files/annual-payment-statements/other-income
```

공통 응답:

```json
{
  "fileName": "SF1234567.890",
  "encoding": "cp949",
  "contentBase64": "...",
  "textPreview": "...",
  "records": [
    { "index": 1, "type": "A", "byteLength": 170 }
  ],
  "warnings": []
}
```

연간 지급명세서의 파일명 prefix는 원문에서 사업소득 샘플 `F`만 확인했다. 기타소득 지급명세서는 `fileNamePrefix`를 요청 body로 override할 수 있게 둔다.

## 14. RAONKUpload 공통 규격

홈택스 전자파일 업로드는 일반 multipart 업로드 한 번이 아니다. RAONKUpload HTML5 프로토콜을 따라 3단계를 호출한다.

공통 endpoint:

```text
POST {baseURL}/fileUploadDownloadNX.do?mode=upload&uploadTypeCd={uploadTypeCd}&onlineBatch=batch
```

현재 관측값:

```text
uploadTypeCd=02
onlineBatch=batch
```

### RAON command 구분자

```text
필드 구분: vertical tab, \v, 0x0B
key/value 구분: form feed, \f, 0x0C
```

key/value 조합:

```text
{key}\f{value}
```

여러 필드는 `\v`로 join한다.

### RAON 인코딩

현재 구현은 RAON의 `_fn_$mEP` 흐름을 따른다.

1. command 문자열을 UTF-8 Base64로 인코딩
2. 길이가 10 이상이면 아래 순서로 고정 문자열 삽입

```text
insertAt(8, "r")
insertAt(6, "a")
insertAt(9, "o")
insertAt(7, "n")
insertAt(8, "w")
insertAt(6, "i")
insertAt(9, "z")
```

3. `+`를 `%2B`로 치환
4. form field는 `k00={encoded}`로 보냄

복호화는 반대로 `[9, 6, 8, 7, 9, 6, 8]` 위치 문자를 제거하고 Base64 decode한다.

### 1단계: c01 시작 요청

URL:

```text
POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

plain command:

```text
kc\f c01
k01\f 0
k05\f 1
k12\f {guid}
k13\f {fileSize}
k14\f {originalName}
k15\f
k16\f
k17\f {folderNameRule}
k20\f 0z
k21\f
```

공백 없이 실제로는 아래처럼 `\f`, `\v`로 결합한다.

```text
kc\fc01\vk01\f0\vk05\f1\vk12\f{guid}\vk13\f{fileSize}\vk14\f{originalName}\vk15\f\vk16\f\vk17\f{folderNameRule}\vk20\f0z\vk21\f
```

현재 `folderNameRule`:

```text
/rn/UPLOAD_DIR/{YYYYMMDD}/{sessionMap.pubcUserNo}
```

응답 예:

```text
[OK]{encodedPlain}
```

plain decode 결과:

```text
{serverPath}\v{size}\v-\v-
```

예:

```text
/btch0.p/batch/teBatch/rn/UPLOAD_DIR/20260626/100000000017241052/20260213C103900.01\v1357\v-\v-
```

### 2단계: c02 파일 조각 업로드

URL:

```text
POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch&raonk=urk_{random}
Content-Type: multipart/form-data
```

multipart fields:

```text
k00={encoded c02 command}
blob={file binary}
```

c02 command:

```text
kc\fc02
k01\f0
k02\f
k03\f0
k05\f1
k12\f{guid}
k19\f0
k26\f{serverPath}
```

응답:

```xml
<RAONK>[OK]</RAONK>
```

### 3단계: c03 완료 요청

URL:

```text
POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

c03 command:

```text
kc\fc03
k01\f0
k12\f{guid}
k14\f{originalName}
k15\f
k16\f
k17\f{folderNameRule}
k20\f0z
k21\f
```

plain decode 결과:

```text
{uploadName}:{serverRelativePath}\f
```

예:

```text
20260213C103900.01:/rn/UPLOAD_DIR/20260626/100000000017241052/20260213C103900.01\f
```

검증 action에는 보통 아래 값을 넣는다.

```text
orcFleNm={basename(serverRelativePath)}
storedFileList={basename(serverRelativePath)}
localfileList={originalName}
fileSizeList={file.size}
fileAdmDVOList[0].localFlePth={originalName}
```

### RAON 응답 처리

응답 wrapper:

```text
<RAONK>...</RAONK>
```

성공:

```text
[OK]
[OK]{encodedPlain}
```

실패:

```text
[FAIL]{encodedPlain}
```

실패 plain 예:

```text
001|Command value is null
```

## 15. 아직 미확정 / 추가 HAR 필요

### 간이지급명세서

캡처만으로 action 순서와 `screenId=UWEICAAD15`는 확인했다. 하지만 아래 값은 HAR payload가 필요하다.

```text
사업소득 bsafClCd / itrfCd / cvaKndCd / stmnKndCd
기타소득 bsafClCd / itrfCd / cvaKndCd / stmnKndCd
ATESFAAA001A01 정확한 payload root 구조
ATESFAAA001K01 polling payload
오류 조회 action의 request/pageInfo 구조
최종 제출 actionId와 필수 payload
```

### 전자파일 생성

현재 구현은 사용자가 만든 전자파일을 업로드하고 검증한다. 사용자 입력으로 사업소득/기타소득 전자파일을 생성하는 로직은 별도 구현이 필요하다.

필요한 자료:

```text
간이지급명세서(거주자의 사업소득) 전산매체 제출요령
간이지급명세서(거주자의 기타소득) 전산매체 제출요령
레코드 길이 / 레코드 타입 / CP949 인코딩 여부
소득자 상세 레코드 / 지급자 합계 레코드 규격
금액 zero padding / 문자 공백 padding 규칙
```

## 16. 구현 파일 매핑

| 기능 | 파일 |
| --- | --- |
| 간편인증 외부 API | `src/hometax/interfaces/hometax-auth.controller.ts` |
| 간편인증 서비스 | `src/hometax/services/hometax-auth.service.ts` |
| OACX 클라이언트 | `src/hometax/clients/hometax-oacx.client.ts` |
| permission / pubcLogin | `src/hometax/clients/hometax-permission.client.ts` |
| TEHT 세션 연결 | `src/hometax/clients/hometax-teht-session.client.ts` |
| wqAction 공통 호출 | `src/hometax/clients/hometax-wq-action.client.ts` |
| NTS payload | `src/hometax/utils/nts-payload.ts` |
| RAON 업로드 클라이언트 | `src/hometax/clients/hometax-upload.client.ts` |
| RAON command/인코딩 | `src/hometax/utils/raonk-upload.ts` |
| 사업장 조회 | `src/hometax/services/hometax-business-place.service.ts` |
| 원천세 검증/제출 | `src/hometax/services/hometax-withholding-tax.service.ts` |
| 간이지급명세서 검증 | `src/hometax/services/hometax-simple-payment-statement.service.ts` |
