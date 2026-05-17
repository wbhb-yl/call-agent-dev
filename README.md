# Call Agent MVP

실시간 전화 통화를 처리하는 AI 에이전트. 해커톤 MVP.

## 시나리오

| # | 시나리오 | 설명 |
|---|---|---|
| 1 | 일정 등록 | 에이전트가 전화를 받아 대화하고 일정을 캘린더에 등록 |
| 2 | 보이스피싱 감지 | 의심 패턴 감지 시 에이전트가 대신 응대 + 사용자 알림 |
| 3 | 실시간 어시스턴트 | 통화 중 "에이전트" 호출 시 질문에 답변 |

---

## 기술 스택

| 역할 | 기술 |
|---|---|
| 전화 인프라 | Twilio Media Streams (WebSocket) |
| STT | Deepgram Streaming API |
| AI Agent | Claude API (claude-haiku-4-5) |
| TTS | ElevenLabs Streaming API |
| 캘린더 | Google Calendar API |
| 알림 | Twilio SMS |
| 서버 | FastAPI + WebSocket |
| 대시보드 | HTML + Vanilla JS (FastAPI static) |
| 언어 | Python 3.10+ |

---

## 전체 흐름

```
전화 수신 (Twilio)
    ↓
WebSocket 오디오 스트림
    ↓
Deepgram STT (실시간 텍스트 변환)
    ↓
Claude Agent (모드 판단 + 응답 생성)
    ↓
    ├── 일정 등록 → Google Calendar API
    ├── 보이스피싱 → 상대방 응대 + Twilio SMS 알림
    └── 에이전트 호출 → 답변 후 모니터링 복귀
    ↓
ElevenLabs TTS (음성 생성)
    ↓
Twilio로 음성 전송
    ↓
대시보드 WebSocket → 브라우저 실시간 업데이트
```

---

## 에이전트 상태 머신

```
IDLE
  ↓ 전화 수신
MONITORING          ← 기본 상태 (모든 대화 분석 중)
  ↓                       ↓                    ↓
TAKEOVER           ASSIST               CALENDAR
(보이스피싱)       (어시스턴트 호출)    (일정 등록)
  ↓                       ↓                    ↓
MONITORING         MONITORING           MONITORING
```

---

## 프로젝트 구조

```
call-agent/
│
├── main.py                  # FastAPI 앱 진입점
├── requirements.txt         # 의존성 패키지
├── .env                     # API 키 (git 제외)
├── .env.example             # 환경변수 예시
│
├── core/
│   ├── agent.py             # Claude Agent (상태 관리 + 응답 생성)
│   ├── state.py             # 에이전트 상태 머신 (IDLE/MONITORING/TAKEOVER/ASSIST/CALENDAR)
│   └── prompts.py           # 시나리오별 시스템 프롬프트
│
├── services/
│   ├── stt.py               # Deepgram STT 클라이언트
│   ├── tts.py               # ElevenLabs TTS 클라이언트
│   ├── calendar.py          # Google Calendar API 연동
│   └── notification.py      # Twilio SMS 알림
│
├── handlers/
│   ├── call.py              # Twilio 전화 수신 WebHook
│   ├── stream.py            # Twilio Media Stream WebSocket 핸들러
│   └── dashboard.py         # 대시보드 WebSocket 핸들러 (브라우저 실시간 업데이트)
│
├── static/
│   ├── index.html           # 대시보드 메인 화면
│   ├── style.css            # 스타일
│   └── dashboard.js         # WebSocket 연결 + 실시간 UI 업데이트
│
└── README.md
```

---

## 환경변수 (.env)

```
# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Deepgram
DEEPGRAM_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Google Calendar
GOOGLE_CALENDAR_ID=
GOOGLE_CREDENTIALS_PATH=credentials.json

# 사용자 알림 수신 번호
USER_PHONE_NUMBER=
```

---

## 대시보드 화면 구성

```
┌─────────────────────────────────────────────────┐
│  Call Agent Dashboard                           │
├──────────────┬──────────────────────────────────┤
│              │                                  │
│  에이전트    │   실시간 대화 내용               │
│  상태        │                                  │
│              │   [발신자] 안녕하세요...         │
│  ● MONITORING│   [에이전트] 네, 말씀하세요.    │
│              │   [발신자] 다음 주 화요일...     │
│              │                                  │
├──────────────┼──────────────────────────────────┤
│  등록된 일정 │   ⚠️ 보이스피싱 감지 알림       │
│              │                                  │
│  5/26 14:00  │   의심 키워드: 검사, 계좌이체   │
│  킥오프 미팅 │   에이전트가 대응 중입니다.     │
└──────────────┴──────────────────────────────────┘
```

브라우저 ↔ 서버 간 WebSocket으로 실시간 동기화:
- 에이전트 상태 변경 시 즉시 반영
- STT 텍스트 스트리밍 표시
- 보이스피싱 감지 시 경고 배너
- 캘린더 등록 시 일정 목록 업데이트

---

## 개발 우선순위 (24시간)

```
0~2h   환경 셋업 (계정, API 키, 패키지 설치)
2~6h   handlers/ — Twilio WebSocket 연결 및 오디오 수신
6~10h  services/ — STT → Agent → TTS 파이프라인 연결
10~14h core/     — 상태 머신 + 3가지 시나리오 Claude 프롬프트
14~17h services/ — Google Calendar + SMS 알림
17~20h static/   — 대시보드 UI + WebSocket 연결
20~22h 통합 테스트 + 버그 수정
22~24h 시연 시나리오 리허설
```

---

## 시연 시나리오 스크립트

### 시나리오 1 — 일정 등록
```
발신자: "안녕하세요, 다음 주 화요일 오후 2시에 미팅 잡고 싶은데요."
에이전트: "네, 확인해볼게요. 어떤 내용의 미팅인가요?"
발신자: "프로젝트 킥오프 미팅이에요."
에이전트: "5월 26일 화요일 오후 2시에 프로젝트 킥오프 미팅 등록했습니다."
```

### 시나리오 2 — 보이스피싱 감지
```
발신자: "저는 서울중앙지검 검사 김철수입니다. 귀하의 계좌가 범죄에 연루되어..."
에이전트: [보이스피싱 감지] → 상대방 응대 시작
에이전트: "아 네, 잠깐만요. 메모 좀 할게요. 검사님 성함이 어떻게 되신다고요?"
→ 사용자에게 SMS: "⚠️ 보이스피싱 의심 전화가 감지되었습니다. 에이전트가 대응 중입니다."
```

### 시나리오 3 — 실시간 어시스턴트
```
[통화 중]
사용자: "에이전트, 공정거래법에서 계약 해지 통보 기간이 얼마야?"
에이전트: "공정거래법상 방문판매 계약은 14일 이내 청약 철회가 가능합니다."
사용자: "고마워."
에이전트: [모니터링 모드로 복귀]
```
