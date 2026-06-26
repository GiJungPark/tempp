# 홈택스 원천세 전자신고 API 분석

## 목표

홈택스 간편인증으로 로그인 세션을 만든 뒤, 브라우저 UI 자동화 없이 API 요청만으로 원천세 전자신고 변환파일을 업로드, 검증, 제출한다.

테스트 단계에서는 사용자 1명만 사용하므로 사용자별 세션 저장소는 필수는 아니다. NestJS에서는 애플리케이션 singleton 세션 하나를 두고 `간편인증 요청 -> 인증 확인 -> 홈택스 API 호출`이 같은 cookie jar를 이어 쓰면 된다.

## 기존 Kotlin 구현에서 유지할 것

### 필수 흐름

1. 포털 기본 세션 초기화
   - `permission.do?screenId=index_pp`
   - 기본 포털 쿠키 세팅
   - `TXPPsessionID`, `JSESSIONID` 확보

2. OACX 초기화
   - `GET /oacx/esign/config/config.auth.jsp`
   - `POST /oacx/api/v1.0/trans`
   - 응답의 `txId`, `token` 저장

3. 카카오 provider 조회
   - `GET /oacx/api/v1.0/provider/list`
   - `provider_id == "kakao"`의 `id` 사용

4. 카카오 인증 요청
   - `POST /oacx/api/v1.0/authen/request`
   - 이름, 전화번호, 생년월일은 Base64 인코딩
   - 응답의 `token`, `cxId`, `reqTxId` 저장

5. 인증 결과 확인
   - `POST /oacx/api/v1.0/authen/result`
   - 성공 조건: `resultCode == "200"`
   - 응답에서 갱신된 `token`, `cxId`, `reqTxId`가 있으면 세션에 반영

6. 홈택스 공개인증 로그인으로 승격
   - `POST /pubcLogin.do?domain=hometax.go.kr&mainSys=Y`
   - form 값의 `reqTxId`에는 기존 코드처럼 `session.token` 사용

7. 로그인 후 권한/세션맵 조회
   - `POST /permission.do?screenId=UTXPPABA01`
   - 이후 사용자 정보 조회: `permission.do?screenId=UTXPPAAA10`
   - `sessionMap.userId`, `tin`, `pubcUserNo`, `txprDscmNo`, `txaaYn`, `userClsfCd` 확보

8. 세금신고 시스템(TEHT) 세션 생성
   - 신고/제출 계열 화면은 `teht.hometax.go.kr` 도메인을 사용한다.
   - 다운로드 샘플 기준으로 `teht` permission을 먼저 호출하고, 포털 SSO 토큰을 받아 `teht` 세션에 연결한다.
   - 원천세 파일 제출도 `UTERNAAZ0Z11`, `UTERNAA0Z044`, `UTERNAA0Z048`이 `teht` 영역이므로 이 단계가 필요할 가능성이 높다.

### 유지해야 하는 공통 처리

- 모든 응답의 `Set-Cookie`를 이름 기준으로 cookie jar에 병합한다.
- 다음 요청마다 현재 cookie jar 전체를 `Cookie` 헤더로 보낸다.
- `wqAction.do` 요청은 일반 JSON body가 아니라 NTS 검증 문자열을 붙인 body를 보낸다.
- `Origin`, `Referer`, `X-Requested-With`는 가능한 한 브라우저와 동일하게 맞춘다.

## 기존 Kotlin 구현에서 테스트용으로 줄여도 되는 것

### 사용자별 세션 저장소

현재 Kotlin은 `UserId`별 `HometaxLoginContext`를 저장한다. 테스트 1명 기준 NestJS에서는 아래처럼 줄일 수 있다.

```ts
class HometaxRuntimeSession {
  cookies = new Map<string, string>();
  token?: string;
  txId?: string;
  reqTxId?: string;
  cxId?: string;
  command?: KakaoAuthCommand;
  sessionMap?: HometaxSessionMap;
}
```

요청 API도 `userId` 없이 다음처럼 단순화할 수 있다.

```text
POST /hometax/auth/request
POST /hometax/auth/confirm
GET  /hometax/session
POST /hometax/withholding/upload-and-validate
POST /hometax/withholding/submit
```

### DB 저장

아래는 테스트용 구현에서는 제거해도 된다.

- `UserRepository` 조회
- `HometaxAccountConnectionRepository.save`
- `connectedAt` 저장
- 사용자별 `ConcurrentHashMap`

단, 운영 전환 시에는 Redis나 DB에 세션을 분리 저장해야 한다.

## Python 다운로드 샘플에서 참고할 것

추가로 확인한 `/Users/nox/Downloads/홈택스_간편인증_신고서_다운로드` 소스는 신고서 조회/다운로드 샘플이다. 원천세 제출 액션과 직접 같지는 않지만, 로그인 후 TEHT 도메인으로 넘어가는 방식이 유용하다.

### 확인된 TEHT 흐름

```text
POST https://teht.hometax.go.kr/permission.do?screenId=UTERNAAZ0Z11
POST https://hometax.go.kr/token.do?query=_xlrCT2AfgQtDvloaQ26M
POST https://teht.hometax.go.kr/permission.do?screenId=UTERNAAZ0Z11&domain=hometax.go.kr
```

두 번째 `permission.do`에는 `token.do` 응답에 `popupYn=false`를 추가해서 보낸다. 이 흐름은 포털 로그인 세션을 세금신고 도메인 세션으로 승격/연결하는 단계로 보인다.

### 신고 목록 조회 샘플

다운로드 샘플은 종합소득세 `itrfCd = 10` 신고 내역을 조회한다.

```text
POST https://teht.hometax.go.kr/wqAction.do?actionId=ATERNABA016R01&screenId=UTERNAAZ0Z31&popupYn=true&realScreenId=UTERNAAZ0Z31
```

주요 요청 필드:

```json
{
  "itrfCd": "10",
  "pubcUserNo": "{pubcUserNo}",
  "tin": "{tin}",
  "txprRgtNo": "{txprDscmNo}",
  "startBsno": "{txprDscmNo}",
  "stmnWrtMthdCd": "99",
  "scrnId": "UTERNAAZ0Z31",
  "pageInfoVO": {
    "pageNum": "1"
  }
}
```

이 샘플에서 `tin`, `pubcUserNo`, `txprDscmNo`가 TEHT 업무 API에 계속 들어가는 것이 확인된다. 원천세 제출 요청에도 같은 sessionMap 값들이 필요하다.

### 신고 상세/출력 샘플

상세 조회:

```text
POST https://teht.hometax.go.kr/wqAction.do?actionId=ATTRNZZZ020R01&screenId=UTERNAAZ34&popupYn=true&realScreenId=
```

리포트 HTML 생성:

```text
POST https://sesw.hometax.go.kr/serp/clipreport.do
```

`clipreport.do`에는 `param = JSON.stringify(htmlData)` 형식으로 전달한다. 원천세 파일 제출 자체에는 필요 없지만, 제출 후 접수증/신고서 출력 기능을 만들 때 재사용할 수 있다.

### Python 샘플에서 그대로 가져오면 안 되는 부분

- `post_json_to_token()`에 NTS 꼬리값이 하드코딩되어 있다.
  - `"<nts<nts>nts>470Yc1yHv9ukMXGyKeVFg6bMkb21O39yc7gJSJKwHmg36"`
  - 이 값은 현재 초, payload, userId에 따라 매번 달라져야 하므로 사용하면 안 된다.
- `__main__`에 실명, 생년월일, 전화번호가 하드코딩되어 있다. NestJS 포팅 시 샘플/테스트 코드에서도 제거한다.
- `requests.post("https://sesw.hometax.go.kr/serp/clipreport.do", ...)`는 세션 쿠키를 넘기지 않는 독립 요청이다. 현재 샘플에서 동작했더라도 NestJS에서는 필요한 쿠키/파라미터를 명시적으로 넘기도록 구현하는 편이 안전하다.
- `extract_tin_or_error()`는 JS-like 응답 문자열을 정규식으로 파싱한다. 가능하면 `permission.do`의 `sessionMap` JSON을 정식 파싱해서 쓰는 기존 Kotlin 방식이 낫다.

### Python 샘플에서 가져갈 부분

- `teht.hometax.go.kr`로 넘어가기 전 `token.do`를 호출하는 단계
- `teht` permission 선행 호출
- TEHT 업무 API에 `tin`, `pubcUserNo`, `txprDscmNo`를 넣는 패턴
- 신고서/접수증 출력까지 확장할 때 `sesw.hometax.go.kr/serp/clipreport.do` 사용 가능성

### 응답 body 원문 저장

`publicLoginResponseBody`, `postLoginPermissionResponseBody`, `businessPlaceListResponseBody`는 디버깅에는 좋지만 필수 상태는 아니다. NestJS에서는 debug log 또는 optional trace 필드로 빼도 된다.

## 주의할 점

### 개인정보 로그 마스킹

현재 Kotlin `HometaxHttpClient`는 body와 headers를 꽤 자세히 로깅한다. 간편인증 요청에는 이름, 전화번호, 생년월일, 쿠키, 토큰이 포함되므로 NestJS에서는 기본적으로 마스킹해야 한다.

마스킹 대상:

- `Cookie`
- `token`, `txId`, `reqTxId`, `cxId`
- 이름, 전화번호, 생년월일
- `signedData`, `data`
- 홈택스 sessionMap 전체

### `UTXPPAAA10` permission cookie

기존 구현은 `UTXPPAAA10` 권한 조회 시 전체 쿠키가 아니라 `TXPPsessionID`, `JSESSIONID`만 보낸다. 이 동작은 유지하는 편이 좋다. 해당 화면에서 `sessionMap`이 첫 응답에 없을 수 있으므로 재시도도 유지한다.

## wqAction.do NTS body 생성

홈택스 업무 API는 `/wqAction.do`를 사용한다. body 뒤에 다음 꼬리를 붙여야 한다.

```text
JSON.stringify(payload) + "<nts<nts>nts>" + (second + 11) + hmac + second
```

HMAC 생성 방식:

```text
key = testVal[second % 7]
hmac = HMAC_SHA256_BASE64(json + userId, key)
hmac = hmac.replace(/[^0-9a-zA-Z]/g, "")
second = 현재 초 2자리 문자열
```

키 목록:

```ts
const testVal = [
  "fjaS3kdHQsdfvnm359WxzmWMV8xm5qmrcRXxolOqm4",
  "qns5HuJxhT3QM8cIOSxqYw92xOpv7oMETetLjO3Zog",
  "Zomr4yL5NpOcj4EfBxdDsweUxOvGWugbJ7c9xhwm",
  "tOpenmvLO8XhwmY2Nxpi2eP3xcmniJj2e4xc8FamH0",
  "qyVMuRUwZO93CGhkWtJFFrmEKMAg9z3FBLcKAyMxxA",
  "RF413bvdLE31OL3dnmeC7r7EbMVo1oh4OrOVMMysR",
  "OINbDScmre3r8ckDpIoKAyO5B6wwKulnDJkxwFBvRX",
];
```

요청 URL 형태:

```text
POST /wqAction.do?actionId={ACTION_ID}&screenId={SCREEN_ID}&popupYn=false&realScreenId=
Content-Type: application/json
```

## 원천세 전자파일변환 기본값

```json
{
  "bsafClCd": "004",
  "itrfCd": "14",
  "cvaKndCd": "FF000",
  "stmnWrtMthdCd": "03"
}
```

- `itrfCd = 14`: 원천세
- `bsafClCd = 004`: 세금신고 업무 구분
- `cvaKndCd = FF000`: 일괄변환 전자파일 대민신고(원천세)
- `stmnWrtMthdCd = 03`: 대민 변환파일 제출

## 전자파일 업로드

화면 `UTERNAA0Z044`는 RAON K Upload 래퍼를 사용한다. 핵심 업로드 엔드포인트:

```text
POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch
```

화면의 업로드 설정:

```json
{
  "Type": "upload",
  "Runtimes": "html5",
  "EncYn": "N",
  "UploadTypeCd": "02",
  "BizDiv": "rn",
  "BizCode": "rnBatch",
  "OnlineBatch": "batch",
  "SubDir": "UPLOAD_DIR/{currentServerDate}/{pubcUserNo}",
  "SimpleUploadYn": "Y",
  "MaxFileCount": "1"
}
```

업로드 완료 후 RAON의 `uploadName`이 검증 요청의 `orcFleNm`, `storedFileList`로 들어간다. multipart 필드명은 실제 세션에서 업로드 요청 1회만 캡처해서 확정하는 것이 좋다. 제출 API는 이 단계에서 호출하지 않아도 된다.

## 전자파일 검증 API

화면:

```text
UTERNAA0Z044
```

액션:

```text
ATTCMZAA002R01  송수신 처리 제한/파일 크기 조회
ATERNABB001A01  형식검증
ATERNABB001R07  변환검증상태조회
ATERNABB001A02  내용검증
ATERNABB001R01  내용검증처리결과조회
ATERNABB001A04  검증취소
```

형식검증 요청 예시:

```json
{
  "request": {
    "bsafClCd": "004",
    "itrfCd": "14",
    "cvaKndCd": "FF000",
    "orcFleNm": "{serverUploadName}",
    "storedFileList": "{serverUploadName}",
    "fileSizeList": "{fileSize}",
    "sbmtTxprRgtNo": "{txprDscmNo}",
    "userId": "{userId}",
    "tin": "{tin}",
    "txaaYn": "{txaaYn}",
    "pubcUserNo": "{pubcUserNo}",
    "userClsfCd": "{userClsfCd}",
    "frVrfBtchCalYn": "A",
    "inputPassword": "",
    "fleTrmnMthdCd": "03",
    "excpType": ""
  },
  "fileAdmDVOList": [
    {
      "localFlePth": "{originalFileName}"
    }
  ]
}
```

암호화 파일 처리:

- `ITICMZ0098`: 암호 입력 필요
- `ITICMZ0099`: 암호 불일치
- `ITICMZ0097`: 암호화 파일만 허용되는 케이스

암호는 Base64 인코딩해서 `inputPassword`에 넣고 `ATERNABB001A01`을 재호출한다.

## 검증 상태 머신

`ATERNABB001R07` 응답의 `trnsPrgrStat`를 기준으로 진행한다.

```text
00 최초
10 형식검증 진행중
11 형식검증 완료, 오류만 존재
12 형식검증 완료, 내용검증 대상 존재
20 내용검증 진행중
21 내용검증 완료, 오류만 존재
22 내용검증 완료, 제출대상 존재
23 대상건수 초과 등으로 내용검증 취소
```

권장 흐름:

```text
ATERNABB001A01 형식검증
-> ATERNABB001R07 polling
-> 12면 ATERNABB001A02 내용검증
-> ATERNABB001R07 polling
-> 22면 제출 가능
-> 11/21/23이면 실패 처리
```

polling 간격은 화면 기준 약 3초다.

## 제출대상 조회와 최종 제출

제출 화면:

```text
UTERNAA0Z048
```

제출대상 조회:

```text
ATERNABB001R06
screenId: UTERNAAZ48
```

요청:

```json
{
  "request": {
    "fleSbmsCvaId": "{fleSbmsCvaId}"
  },
  "pageInfoVO": {
    "pageSize": "10",
    "pageNum": "1",
    "totalCount": "0"
  }
}
```

최종 제출:

```text
ATERNZZZ001A01
```

요청:

```json
{
  "request": {
    "itrfCd": "14",
    "stmnWrtMthdCd": "03",
    "cvaId": "{fleSbmsCvaId}",
    "excpType": "",
    "warnGdncCnfrYn": "N",
    "pubcUserNo": "{pubcUserNo}",
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

성공 상태:

```text
RTN_SBMS_CMPL_STAT_10
```

실제 제출 API인 `ATERNZZZ001A01`은 테스트 코드에서도 별도 확인 플래그 없이는 호출하지 않도록 방어해야 한다.

## 접수증 조회

파일변환 제출 후 접수증은 일괄접수증 화면을 사용한다.

```text
UTERNAAZ02
```

파라미터:

```json
{
  "itrfCd": "14",
  "stmnWrtMthdCd": "03",
  "rtnCvaId": "{fleSbmsCvaId}",
  "fleSbmsCvaId": "{fleSbmsCvaId}"
}
```

## NestJS 모듈 구성 제안

```text
hometax/
  hometax.module.ts
  hometax-session.service.ts
  hometax-http.service.ts
  hometax-oacx.client.ts
  hometax-permission.client.ts
  hometax-teht-session.client.ts
  hometax-wq.client.ts
  hometax-upload.client.ts
  hometax-auth.service.ts
  withholding-tax.service.ts
  withholding-tax.controller.ts
```

역할:

- `HometaxSessionService`: 테스트용 singleton 세션 보관, reset 지원
- `HometaxHttpService`: axios/fetch wrapper, cookie jar 병합, 공통 headers
- `HometaxOacxClient`: 간편인증 요청/결과 조회
- `HometaxPermissionClient`: `permission.do`, `pubcLogin.do`
- `HometaxTehtSessionClient`: `token.do`와 `teht permission.do`로 세금신고 도메인 세션 생성
- `HometaxWqClient`: NTS body 생성 후 `wqAction.do` 호출
- `HometaxUploadClient`: `/fileUploadDownloadNX.do` 업로드
- `WithholdingTaxService`: 업로드, 검증 상태 머신, 제출 방어

## 2026-06-26 HAR/RAON JS 추가 분석

브라우저의 파일검증 HAR를 기준으로 보면 `/fileUploadDownloadNX.do`는 일반 multipart 업로드 한 번으로 동작하지 않는다. RAONKUpload의 HTML5 프로토콜을 따라야 한다.

필수 순서:

```text
1. POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch
   - x-www-form-urlencoded
   - RAON c01 시작 요청
   - 응답: [OK]{encoded}
   - 복호화 후: {serverPath}\v{fileSize}\v-\v-

2. POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch&raonk=urk_...
   - multipart/form-data
   - k00: RAON c02 조각 업로드 요청
   - blob: 실제 파일
   - 응답: <RAONK>[OK]</RAONK>

3. POST /fileUploadDownloadNX.do?mode=upload&uploadTypeCd=02&onlineBatch=batch
   - x-www-form-urlencoded
   - RAON c03 업로드 종료 요청
   - 응답: [OK]{encoded}
   - 복호화 후: {originalName}:{serverRelativePath}\f
   - `ATERNABB001A01`의 `orcFleNm`, `storedFileList`에는 `serverRelativePath`의 basename을 넣는다.
```

성공 HAR의 multipart `k00` 값을 복호화하면 다음 구조였다.

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

RAON의 `_fn_$mEP`는 강한 암호화가 아니라 `utf8 base64` 결과에 `raonwiz` 문자를 고정 위치로 삽입한 뒤 `+`를 `%2B`로 치환하는 난독화다. 복호화는 삽입 위치 `[9, 6, 8, 7, 9, 6, 8]`을 순서대로 제거한 뒤 base64 decode 하면 된다. 홈택스 현재 업로드 설정은 `k01=0` 즉 `encryptParam=0` 흐름으로 관측됐다.

구현 반영:

- [src/hometax/utils/raonk-upload.ts](/Users/nox/Documents/홈택스/src/hometax/utils/raonk-upload.ts): RAON command 생성/인코딩/응답 복호화
- [src/hometax/clients/hometax-upload.client.ts](/Users/nox/Documents/홈택스/src/hometax/clients/hometax-upload.client.ts): `c01 -> c02 multipart -> c03` 업로드 절차

주의할 점:

- 브라우저 HAR에는 `serviceCheck.do?eversafe=v`로 감싼 `7LCLVxe/Rfb86Os1z` 요청도 보이지만, 실제 multipart 단계는 `k00 + blob` 원형 그대로 전송된다.
- 현재 Nest 구현은 `k00` 원형 프로토콜을 우선 사용한다. 만약 홈택스 서버가 특정 세션에서 `7LCLVxe/Rfb86Os1z` 래핑만 받도록 바뀌면 RAON의 eversafe 래퍼를 추가로 이식해야 한다.
- 사용자가 제공한 파일은 업로드/형식검증 진입에는 성공했지만, 홈택스 응답상 `fleFrVrfErrScnt=1`, `fleFrVrfErrClusCnt=2`, `trnsPrgrStat=11`로 파일 내용 자체의 형식 오류가 있었다.

### A01 입력 데이터 주의

`ATERNABB001A01`의 입력은 화면 JS의 action mapping 기준으로 아래 두 덩어리다.

```text
request        <- dma_search_s1 전체
fileAdmDVOList <- dlt_fileList
```

여기서 `request`는 서버 DVO 이름처럼 보이지만, 공통 JS `nts_makeSrvReqData`의 `search` 타입 처리는 `dma_search_s1`의 각 필드를 요청 JSON 최상위로 펼친다. 따라서 API에서 아래처럼 보내면 안 된다.

```json
{
  "request": {
    "bsafClCd": "004",
    "itrfCd": "14"
  },
  "fileAdmDVOList": []
}
```

실제 브라우저 구조는 아래에 가깝다.

```json
{
  "bsafClCd": "004",
  "itrfCd": "14",
  "fileAdmDVOList": []
}
```

`dma_search_s1`에는 `orcFleNm`, `storedFileList`, `fileSizeList`뿐 아니라 `ATTCMZAA002R01`에서 받은 처리 제한값(`minTrtFleSz`, `maxTrtFleSz`, `minTrtScnt`, `maxTrtScnt`, `frVrfTrtScnt`, `cntnVrfTrtScnt`, `sbmsTrtScnt`)과 빈 상태값들이 같이 들어간다. 일부 필드만 손으로 구성하면 홈택스가 `ETICMZ0003 입력데이터가 올바르지 않습니다`를 반환할 수 있다.

현재 Nest 구현은 화면의 `dma_search_s1` 키 전체를 최상위 필드로 맞춰 보내도록 조정했다. 이 조정 후 `20260213C103900.01` 테스트에서 `ATERNABB001A01`은 `trnsPrgrStat=10`으로 진입했고, `ATERNABB001R07` 조회 결과 `trnsPrgrStat=11`, `fleFrVrfErrScnt=1`, `fleFrVrfErrClusCnt=2`를 받았다. 즉 API 호출 구조는 통과했고, 해당 샘플 파일은 홈택스 형식검증상 오류 파일이다.

브라우저 성공 요청과 맞춰야 하는 세션/헤더:

- `NTS_REQUEST_SYSTEM_CODE_P=TEHT`
- `Origin: https://hometax.go.kr`
- `Referer: https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=41&tm2lIdx=4106000000&tm3lIdx=4106010000`

`wqAction.do` URL은 `https://teht.hometax.go.kr`이지만, 브라우저 요청의 origin/referrer는 포털 도메인이다.

## NestJS 테스트용 API 흐름

```text
POST /hometax/auth/request
body: { name, phoneNumber, birthday }

POST /hometax/auth/confirm
body: {}

GET /hometax/auth/session
response: { userId, tin, pubcUserNo, txprDscmNo, txaaYn, userClsfCd }

GET /hometax/business-places

POST /hometax/withholding-tax/validate
multipart: file

GET /hometax/withholding-tax/submit-targets
query: fleSbmsCvaId

POST /hometax/withholding-tax/submit
body: { fleSbmsCvaId, confirmSubmit: true }
```

`confirmSubmit !== true`이면 최종 제출 API를 호출하지 않는다.
