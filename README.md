# Market Pulse

> 소규모 팀이 웹사이트 하나로 한국 시장의 방향, 수급, 글로벌 위험 변수, 신용 레버리지, 핵심 뉴스를 연결해 보는 내부 시장 상황실입니다.

![License](https://img.shields.io/badge/status-prototype-B9DF47?style=flat-square)
![Runtime](https://img.shields.io/badge/runtime-Node.js-10231F?style=flat-square)

## 무엇을 해결하나요?

시장은 한 종목의 등락만으로 판단하기 어렵습니다. Market Pulse는 **국내 지수와 선물 수급 → 환율·미국 금리·나스닥 선물 → 시장 전체 신용 레버리지 → 시장을 바꾼 뉴스**를 같은 화면과 시간축에서 연결합니다.

이 프로젝트는 매수·매도 추천이나 자동 주문 도구가 아닙니다. 팀이 시장의 위험 선호와 취약성을 빠르게 공유하기 위한 **읽기 전용 관찰 도구**입니다.

## 현재 화면

| 화면 | 보는 내용 |
| --- | --- |
| 시장 개요 | 시장 국면, 판단 근거, 코스피·코스닥·선물·환율·나스닥 선물의 상대 변화 |
| 국내 수급 | 외국인 코스피200 선물 누적 수급과 투자자별 현물 수급 |
| 글로벌 환경 | 나스닥100 선물, 미국 10년물, WTI, 금, 달러 인덱스, VIX |
| 신용 레버리지 | 코스피·코스닥 신용잔고, 레버리지 위험도, 위험 구성 요소와 판단 근거 |
| 뉴스 타임라인 | 시장에 영향을 줄 수 있는 국내외 이벤트와 시장 반응 맥락 |

모든 화면 값은 현재 **UI 검토용 시연 데이터**입니다. 실제 공급원을 연결하기 전에는 투자 판단에 사용하면 안 됩니다.

## 빠른 시작

### 요구 사항

- Node.js 18 이상

### 실행

```bash
git clone https://github.com/juhwan7/market-pulse.git
cd market-pulse
node server.js
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 구조

```text
.
├── index.html                  # 대시보드 애플리케이션 셸
├── styles.css                  # 반응형 화면 스타일
├── app.js                      # 화면 상태, 탭, 차트, 시연 데이터 렌더링
├── server.js                   # 정적 파일, 상태 API, SSE 스트림
├── mcp-config.example.toml     # Codex용 로컬 MCP 연결 예시
├── .env.example                # 서버 전용 환경 변수 예시
└── skills/
    └── market-pulse-ops/
        └── SKILL.md            # 데이터·지표·보안 운영용 Codex 스킬
```

## API 계약

현재 서버는 시연용 API와 Server-Sent Events(SSE, 서버가 브라우저에 변화를 즉시 전달하는 연결)를 제공합니다.

| 경로 | 설명 |
| --- | --- |
| `GET /api/health` | 서버 상태 및 시연/실운영 모드 |
| `GET /api/market/overview` | 시장 상태와 핵심 지표 |
| `GET /api/market/stream` | 실시간 이벤트 연결 |
| `POST /mcp` | Codex 등 MCP 클라이언트가 읽기 전용 시장 도구를 호출하는 엔드포인트 |

실제 데이터 어댑터는 아래 엔드포인트를 추가하는 방식으로 확장합니다.

```text
GET /api/market/flows
GET /api/market/global
GET /api/market/leverage
GET /api/market/news
```

모든 데이터 응답에는 최소한 아래 필드를 포함해야 합니다.

```json
{
  "asOf": "2026-09-08T09:00:00+09:00",
  "source": "data-provider-name",
  "isDelayed": false,
  "data": {}
}
```

`asOf`는 데이터 기준 시각, `source`는 공급원, `isDelayed`는 지연 시세 여부입니다. 특히 신용융자 잔고는 장중 가격과 달리 전일 또는 공표 기준일 자료일 수 있으므로, 이를 실시간 데이터처럼 표시해서는 안 됩니다.

## 데이터·보안 원칙

1. API 키, 계좌 번호, 주문 권한은 서버 환경 변수에만 보관합니다. 브라우저 코드와 Git 저장소에는 넣지 않습니다.
2. 공급원별 이용약관과 내부 표시·재배포 가능 범위를 연결 전에 확인합니다.
3. 원본 응답 전체가 아닌 화면에 필요한 정규화 데이터만 사용자에게 전달합니다.
4. 공급원 오류가 나면 마지막 정상 데이터의 시각과 `stale` 상태를 표시합니다.
5. 신용 레버리지 점수는 관찰 지표이며, 확정적인 하락 예측이나 투자 권고가 아닙니다.

## Codex 스킬

[`skills/market-pulse-ops/SKILL.md`](skills/market-pulse-ops/SKILL.md)는 이 프로젝트를 안전하게 확장하기 위한 운영 지침입니다. 데이터 어댑터, 시장 국면·레버리지 지표, 뉴스 타임라인, 보안 검토를 변경할 때 사용합니다.

## MCP 연결

서버가 실행 중일 때 아래 명령으로 Codex에 읽기 전용 시장 도구를 등록합니다.

```bash
codex mcp add marketPulse --url http://127.0.0.1:4173/mcp
```

등록 후 새 Codex 세션에서 `시장 상황을 요약해줘`, `신용 레버리지 위험도를 보여줘`처럼 요청하면 `market_get_overview`, `market_get_leverage_risk`, `market_get_news_timeline`, `market_get_server_status` 도구를 사용할 수 있습니다.

로컬 서버는 기본적으로 `127.0.0.1`에만 바인딩합니다. 외부에 배포할 때는 HTTPS, `MARKET_PULSE_MCP_TOKEN`, 접근 제어, 데이터 공급원 재배포 권한을 반드시 구성해야 합니다. 주문·계좌·설정 변경 도구는 이 MCP 서버에 포함하지 않습니다.

## 다음 단계

- 허용 범위가 확인된 국내 지수·선물·수급 공급원 연결
- 글로벌 지표와 뉴스 공급원 어댑터 연결
- 초대 로그인과 역할 기반 접근 제어 추가
- 신용 레버리지 위험도 산식의 과거 구간 검증
- 서버 비밀 저장소와 배포 환경 구성
