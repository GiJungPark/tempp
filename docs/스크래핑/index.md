---
aliases:
  - 스크래핑 인덱스
  - 홈택스 API 호출 문서
tags:
  - hometax
  - scraping
  - index
---

# 스크래핑 문서 인덱스

홈택스 내부 API 호출과 세션/업로드 흐름을 정리한 문서들이다.

상위 문서: [[docs/홈택스 문서 지도]], [[docs/index|전체 인덱스]]

## 읽는 순서

1. [[docs/스크래핑/홈택스 스크래핑 구현 스펙|홈택스 스크래핑 구현 스펙]]
   - 특정 프레임워크와 무관한 구현 스펙
   - 간편인증, `permission.do`, `wqAction.do`, RAONKUpload 순서
2. [[docs/스크래핑/원천세 API 분석|원천세 API 분석]]
   - 원천세 전자신고 파일 업로드/검증/제출 분석 상세
3. [[docs/스크래핑/간이지급명세서 API 분석|간이지급명세서 API 분석]]
   - 사업소득/기타소득 간이지급명세서 변환파일 제출 화면 분석
4. [[docs/스크래핑/Nest POC API 레퍼런스|Nest POC API 레퍼런스]]
   - 현재 NestJS POC의 외부 API 형태

## 문서별 역할

| 문서 | 역할 |
| --- | --- |
| [[docs/스크래핑/홈택스 스크래핑 구현 스펙|홈택스 스크래핑 구현 스펙]] | 다른 언어/프레임워크로 재구현할 때 기준 |
| [[docs/스크래핑/원천세 API 분석|원천세 API 분석]] | 원천세 HAR/RAON/wqAction 분석 로그 |
| [[docs/스크래핑/간이지급명세서 API 분석|간이지급명세서 API 분석]] | `UWEICAAD15` 화면과 `ATESF...` 계열 action 분석 |
| [[docs/스크래핑/Nest POC API 레퍼런스|Nest POC API 레퍼런스]] | 현재 POC 서버 호출 방법 참고 |

## 구현 시 핵심 확인점

- 같은 cookie jar를 모든 요청에 이어서 사용한다.
- `wqAction.do` body는 JSON 뒤에 NTS suffix를 붙인 문자열이다.
- 파일 업로드는 일반 multipart 한 번이 아니라 RAON `c01 -> c02 -> c03` 3단계다.
- 원천세는 `teht.hometax.go.kr` 세션 연결이 필요하다.
- 간이지급명세서는 `UWEICAAD15` 화면 기준으로 추가 HAR 확정이 필요하다.
