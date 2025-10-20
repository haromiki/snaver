# SNAVER 프로젝트 개발 가이드

이 파일은 Claude Code가 SNAVER 프로젝트에서 작업할 때 참고하는 가이드 문서입니다.

---

## 📋 프로젝트 개요

**SNAVER**는 네이버 쇼핑 순위 추적 및 모니터링 시스템입니다.

### 핵심 기능
- 🔍 **네이버 쇼핑 순위 추적**: 일반 검색 및 광고 순위 자동 모니터링
- 📊 **실시간 업데이트**: WebSocket 기반 라이브 순위 변동 알림
- 📈 **통계 분석**: 일간/주간/월간/연간 순위 및 가격 통계
- 🎯 **키워드 관리**: 다중 키워드 기반 상품 추적
- ⚙️ **유연한 스케줄링**: 상품별 개별 검색 주기 설정 (기본: 60분)

---

## 🏗️ 프로젝트 구조

```
/home/xpro/snaver/
├── client/                    # React PWA 프론트엔드
│   ├── src/
│   │   ├── pages/            # 페이지 컴포넌트 (login, dashboard)
│   │   ├── components/       # UI 컴포넌트
│   │   │   ├── ui/          # shadcn/ui 라이브러리
│   │   │   ├── ProductTable.tsx
│   │   │   ├── AddProductModal.tsx
│   │   │   ├── StatisticsModal.tsx
│   │   │   └── PriceHistoryModal.tsx
│   │   ├── hooks/           # React 커스텀 훅
│   │   │   ├── useAuth.ts
│   │   │   └── useWebSocket.ts
│   │   └── lib/             # 유틸리티
│   └── scripts/
│       └── deploy_client.sh  # 배포 스크립트
│
├── server/                    # Node.js + Express 백엔드
│   ├── index.ts              # 서버 진입점
│   ├── routes.ts             # API 라우트 (1049줄)
│   ├── db.ts                 # PostgreSQL 연결
│   ├── websocket.ts          # WebSocket 서버 (275줄)
│   ├── storage.ts            # 데이터베이스 추상화 (414줄)
│   ├── vite.ts               # Vite 개발 서버 통합
│   ├── crawler/              # 네이버 크롤러
│   │   ├── naverOrganic.ts   # 일반 검색 (OpenAPI)
│   │   ├── naverOrganicPuppeteer.ts # Puppeteer 폴백
│   │   └── adCrawler.ts      # 광고 검색
│   ├── services/
│   │   └── scheduler.ts      # 스케줄러 (486줄)
│   └── middleware/
│       └── auth.ts           # JWT 인증
│
├── shared/                    # 공유 타입 및 스키마
│   └── schema.ts             # Drizzle ORM + Zod 스키마
│
├── package.json
├── tsconfig.json
├── vite.config.ts            # 프론트엔드 빌드
├── vite.build.config.ts      # 백엔드 빌드
├── drizzle.config.ts         # DB 마이그레이션
├── .env                      # 개발 환경 변수
└── .env.production           # 프로덕션 환경 변수
```

---

## 🚀 기술 스택

### 프론트엔드
| 기술 | 버전 | 용도 |
|-----|------|------|
| React | 18.3.1 | UI 프레임워크 |
| TypeScript | 5.9.2 | 타입 안정성 |
| Vite | 5.4.19 | 빌드 도구 |
| React Query | 5.60.5 | 서버 상태 관리 |
| Wouter | 3.3.5 | 라우팅 |
| shadcn/ui | - | UI 컴포넌트 라이브러리 |
| Tailwind CSS | 3.4.17 | 스타일링 |
| WebSocket | - | 실시간 통신 |

### 백엔드
| 기술 | 버전 | 용도 |
|-----|------|------|
| Node.js | v20.19.4 | 런타임 |
| Express.js | 4.21.2 | 웹 프레임워크 |
| TypeScript | 5.9.2 | 타입 안정성 |
| Drizzle ORM | 0.39.3 | ORM |
| PostgreSQL | 14.18 | 데이터베이스 |
| Puppeteer | 24.17.0 | 웹 크롤러 |
| node-cron | 4.2.1 | 스케줄러 |
| ws | 8.18.3 | WebSocket 서버 |
| JWT | 9.0.2 | 인증 |
| bcrypt | 6.0.0 | 비밀번호 암호화 |

---

## 📊 데이터베이스 스키마

### 테이블 구조 (PostgreSQL)

#### users (사용자)
```sql
id             BIGSERIAL PRIMARY KEY
username       VARCHAR(32) UNIQUE NOT NULL
email          VARCHAR(120) UNIQUE
passwordHash   TEXT NOT NULL
createdAt      TIMESTAMP DEFAULT now()
```

#### keywords (검색 키워드)
```sql
id             BIGSERIAL PRIMARY KEY
userId         BIGINT → users.id
keyword        VARCHAR(255) NOT NULL
createdAt      TIMESTAMP DEFAULT now()
```

#### products (모니터링 상품)
```sql
id             BIGSERIAL PRIMARY KEY
userId         BIGINT → users.id (ON DELETE CASCADE)
productName    VARCHAR(200) NOT NULL
productNo      VARCHAR(64) NOT NULL        -- 네이버 상품번호
keyword        VARCHAR(200) NOT NULL       -- 검색 키워드
type           ENUM('ad', 'organic')       -- 광고/일반 구분
intervalMin    INTEGER DEFAULT 60          -- 검색 주기 (분)
active         BOOLEAN DEFAULT true
sortOrder      INTEGER DEFAULT 1000
createdAt      TIMESTAMP DEFAULT now()

UNIQUE INDEX: (userId, productNo, keyword, type)
```

#### tracks (순위 추적 데이터)
```sql
id             BIGSERIAL PRIMARY KEY
productId      BIGINT → products.id (ON DELETE CASCADE)
checkedAt      TIMESTAMP DEFAULT now()
isAd           BOOLEAN NOT NULL
page           INTEGER                     -- 페이지 번호 (1~)
rankOnPage     INTEGER                     -- 페이지 내 순위
globalRank     INTEGER                     -- 전체 순위
priceKrw       BIGINT                      -- 가격
mallName       TEXT                        -- 판매처
productLink    TEXT

INDEX: idx_tracks_product_time (productId, checkedAt)
```

#### statistics (통계 데이터)
```sql
id             BIGSERIAL PRIMARY KEY
productId      BIGINT → products.id
type           ENUM('daily', 'weekly', 'monthly', 'yearly')
periodStart    TIMESTAMP NOT NULL
periodEnd      TIMESTAMP NOT NULL
bestRank       INTEGER                     -- 최고 순위
worstRank      INTEGER                     -- 최저 순위
averageRank    INTEGER                     -- 평균 순위
foundRate      INTEGER                     -- 발견율 (%)
totalChecks    INTEGER DEFAULT 0
avgPrice       BIGINT                      -- 평균 가격
createdAt      TIMESTAMP DEFAULT now()

INDEX: idx_statistics_product_period (productId, type, periodStart)
```

#### weekly_charts (주간 미니 차트)
```sql
id             BIGSERIAL PRIMARY KEY
productId      BIGINT → products.id
weekStart      TIMESTAMP NOT NULL          -- 주 시작일 (한국 시간)
chartData      TEXT                        -- JSON 형태 차트 데이터
createdAt      TIMESTAMP DEFAULT now()

INDEX: idx_weekly_charts_product_week (productId, weekStart)
```

### 엔티티 관계
```
users (1) ──→ (N) products
users (1) ──→ (N) keywords
products (1) ──→ (N) tracks
products (1) ──→ (N) statistics
products (1) ──→ (N) weekly_charts
```

---

## 🔌 API 엔드포인트

### 인증 API
| 메서드 | 경로 | 설명 | 권한 |
|------|------|------|------|
| POST | `/api/auth/register` | 회원 가입 | 공개 |
| POST | `/api/auth/login` | 로그인 | 공개 |
| GET | `/api/auth/naver/callback` | 네이버 OAuth 콜백 | 공개 |
| POST | `/api/auth/logout` | 로그아웃 | 인증 필요 |
| GET | `/api/auth/check-username/:username` | 아이디 중복 확인 | 공개 |

### 상품 관리 API
| 메서드 | 경로 | 설명 | 권한 |
|------|------|------|------|
| GET | `/api/products` | 상품 목록 조회 | 인증 필요 |
| POST | `/api/products` | 상품 추가 | 인증 필요 |
| PUT | `/api/products/:id` | 상품 수정 | 인증 필요 |
| DELETE | `/api/products/:id` | 상품 삭제 | 인증 필요 |
| PUT | `/api/products/sort-order` | 정렬 순서 변경 | 인증 필요 |

### 순위 조회 API
| 메서드 | 경로 | 설명 |
|------|------|------|
| POST | `/api/rank/search` | 즉시 순위 검색 |
| GET | `/api/products/:id/rank-today` | 오늘 순위 조회 |
| GET | `/api/products/:id/price-history` | 가격 이력 조회 |
| GET | `/api/products/:id/statistics` | 통계 데이터 조회 |

### 키워드 관리 API
| 메서드 | 경로 | 설명 |
|------|------|------|
| GET | `/api/keywords` | 키워드 목록 |
| POST | `/api/keywords` | 키워드 추가 |
| PUT | `/api/keywords/:id` | 키워드 수정 |
| DELETE | `/api/keywords/:id` | 키워드 삭제 |

### 시스템 API
| 메서드 | 경로 | 설명 |
|------|------|------|
| GET | `/api/_health` | 헬스 체크 |
| GET | `/api/search-status` | 크롤러 상태 조회 |

---

## 🕷️ 크롤러 시스템

### 1. 일반 검색 크롤러 (Naver OpenAPI)
**파일**: `/home/xpro/snaver/server/crawler/naverOrganic.ts`

```typescript
fetchOrganicRank({
  keyword: "검색어",
  productNo: "상품번호",
  maxPages: 10
}) → RankResult {
  found: boolean
  globalRank: number      // 전체 순위
  page: number           // 페이지 번호
  rankInPage: number     // 페이지 내 순위
  storeName: string      // 판매처
  price: number          // 가격
}
```

**특징**:
- Naver Shopping API 사용 (안정적)
- URL 리다이렉트 자동 처리
- 상품 ID 다중 형식 지원 (productId, prodNo, nvMid)
- 최대 10페이지 검색

### 2. Puppeteer 폴백 크롤러
**파일**: `/home/xpro/snaver/server/crawler/naverOrganicPuppeteer.ts`

- OpenAPI 실패 시 자동 전환
- JavaScript 렌더링 지원
- 네이버 봇 탐지 회피

### 3. 광고 검색 크롤러
**파일**: `/home/xpro/snaver/server/crawler/adCrawler.ts`

- Puppeteer 기반 자동화
- 광고 순위 추적 전용
- 재시도 로직 포함

---

## ⏰ 스케줄러 시스템

**파일**: `/home/xpro/snaver/server/services/scheduler.ts`

### 동작 원리
```
매 30초마다 실행:
  1. 활성 상품 로드 (active = true)
  2. 다음 검사 시간 도래한 상품 필터링
     - 마지막 검사 시간 + intervalMin ≤ 현재 시간
  3. 병렬 크롤링 (동시성 제한: 3-5개)
  4. 결과 저장 (tracks 테이블)
  5. WebSocket 브로드캐스트
  6. 통계 계산 (일일/주간/월간)
```

### 주요 특징
- **개별 스케줄링**: 각 상품의 `intervalMin` 설정에 따라 독립 실행
- **실시간 알림**: WebSocket을 통한 즉시 알림
- **에러 핸들링**: 크롤 실패 시 로그 기록
- **동시성 제어**: 네이버 서버 부하 방지

---

## 🌐 WebSocket 실시간 통신

**파일**: `/home/xpro/snaver/server/websocket.ts`

### 연결 방식
```typescript
// 클라이언트 연결 URL
ws://localhost:3000/api/ws?token=JWT_TOKEN

// 프로덕션
wss://podoo.co.kr/snaver/api/ws?token=JWT_TOKEN
```

### 이벤트 타입
```typescript
interface WSMessage {
  type: 'connected' | 'searchStarted' | 'searchCompleted'
        | 'searchFailed' | 'productUpdated' | 'rankingUpdated' | 'pong'
  data?: any
  message?: string
  timestamp?: string
  clientId?: string
}
```

### 서버 → 클라이언트 이벤트

#### 1. 검색 시작
```typescript
broadcastSearchStarted(productId, keyword)
→ { type: 'searchStarted', data: { productId, keyword } }
```

#### 2. 검색 완료
```typescript
broadcastSearchCompleted(productId, result)
→ {
  type: 'searchCompleted',
  data: {
    productId,
    found: true,
    rank: 15,
    page: 2,
    price: 25000
  }
}
```

#### 3. 순위 업데이트
```typescript
broadcastRankingUpdated(productId, dailyData)
→ { type: 'rankingUpdated', data: { productId, dailyData } }
```

### 클라이언트 훅
```typescript
// 사용 예시
const { isConnected, connectionCount } = useWebSocket();

// 자동 재연결 (exponential backoff)
// 최대 10회 재시도, 최대 30초 대기
```

### Heartbeat 메커니즘
- **서버**: 30초마다 ping 전송
- **클라이언트**: 25초마다 ping 전송
- **연결 종료**: pong 응답 없으면 자동 정리

---

## 🔐 인증 시스템

### JWT 토큰 인증
```typescript
// 로그인
POST /api/auth/login
Body: { usernameOrEmail, password }
Response: { token: "JWT_TOKEN", user: {...} }

// API 요청
Headers: { Authorization: "Bearer JWT_TOKEN" }
```

### 토큰 저장
```typescript
// 로컬 스토리지
localStorage.setItem('token', jwtToken);

// 자동 포함 (lib/api.ts)
headers: {
  'Authorization': `Bearer ${localStorage.getItem('token')}`
}
```

### 네이버 OAuth 2.0
```typescript
// 1. 로그인 버튼 클릭
window.location.href = 'https://nid.naver.com/oauth2.0/authorize?...'

// 2. 콜백 처리
GET /api/auth/naver/callback?code=...&state=...
→ JWT 토큰 발급
```

---

## 🎨 프론트엔드 아키텍처

### 페이지 구조
```
App.tsx (라우터)
  ├── /login          → Login.tsx
  └── /dashboard      → Dashboard.tsx
      ├── ProductTable.tsx      (상품 목록)
      ├── AddProductModal.tsx   (상품 추가)
      ├── StatisticsModal.tsx   (통계 차트)
      ├── PriceHistoryModal.tsx (가격 추이)
      └── KeywordManagerModal.tsx (키워드 관리)
```

### 상태 관리

#### 서버 상태 (React Query)
```typescript
useQuery(['products'], fetchProducts)
useQuery(['product', id], fetchProduct)
useQuery(['statistics', productId], fetchStatistics)
useQuery(['price-history', productId], fetchPriceHistory)
```

#### 로컬 상태
```typescript
localStorage.token                   // JWT 토큰
localStorage['snaver-ui-theme']     // 테마 (light/dark)
```

#### 실시간 상태 (WebSocket)
```typescript
const { isConnected } = useWebSocket();

// 메시지 수신 시 자동 캐시 무효화
queryClient.invalidateQueries(['products']);
```

### 핵심 컴포넌트

#### ProductTable.tsx
- 상품 목록 테이블
- 실시간 순위 업데이트
- 정렬/필터링 기능
- 드래그 앤 드롭 순서 변경

#### StatisticsModal.tsx
- 일간/주간/월간/연간 통계
- 순위 차트 (Recharts)
- 발견율 표시
- 평균 순위 계산

#### PriceHistoryModal.tsx
- 가격 변동 그래프
- 시간대별 가격 조회
- 최고/최저 가격 표시

---

## 🛠️ 개발 및 빌드

### 개발 서버 실행
```bash
npm run dev
# Vite 개발 서버 (포트 3000)
# API 서버 + HMR 활성화
```

### 프로덕션 빌드
```bash
npm run build
# 1. Vite로 React 번들 (client → dist/public)
# 2. esbuild로 Node.js 번들 (server → dist/index.js)

npm run start
# NODE_ENV=production node dist/index.js
# 포트: 3000 (또는 process.env.PORT)
```

### 배포 스크립트
```bash
# 1. 로컬 빌드
npm run build

# 2. 실서버 배포
cd client/scripts
./deploy_client.sh

# 배포 과정:
# - dist/public → 실서버 rsync
# - 서버 측 정적 파일 배포 스크립트 실행
# - 스모크 테스트 (헬스 체크)
```

---

## 🌍 환경 설정

### 개발 환경 (.env)
```bash
# 데이터베이스
DATABASE_URL="postgresql://xpro:password@localhost:5432/snaver"

# 서버 포트
PORT=3000

# Vite API URL
VITE_API_URL="http://localhost:3000/api"

# 네이버 API
NAVER_CLIENT_ID=GA00Aeb6U86S5ebkUNLC
NAVER_CLIENT_SECRET=B19jbdGCxm

# JWT Secret
JWT_SECRET="your-secret-key"
```

### 프로덕션 환경 (.env.production)
```bash
# 데이터베이스
DATABASE_URL="postgresql://xpro:password@production-host:5432/snaver"

# 서버 포트
PORT=3000

# Vite API URL (상대 경로)
VITE_API_URL="/snaver/api"

# 네이버 API
NAVER_CLIENT_ID=production_client_id
NAVER_CLIENT_SECRET=production_client_secret

# JWT Secret
JWT_SECRET="production-secret-key"
```

---

## 🚀 배포 아키텍처

### URL 구조
- **프론트엔드**: `https://podoo.co.kr/snaver/`
- **API**: `https://podoo.co.kr/snaver/api/` (Nginx 프록시 → localhost:3000)

### Vite 기본 경로 설정
```typescript
// vite.config.ts
base: process.env.NODE_ENV === 'production' ? '/snaver/' : '/'
```

### 라우터 기본 경로
```typescript
// App.tsx
const basePath = import.meta.env.DEV ? "/" : "/snaver";
<Router base={basePath}>
```

### Nginx 설정 (예시)
```nginx
location /snaver/api/ {
    proxy_pass http://localhost:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}

location /snaver/ {
    alias /srv/xpro0/snaver/public/;
    try_files $uri $uri/ /snaver/index.html;
}
```

---

## 🔒 보안 고려사항

### 구현된 보안 기능
| 기능 | 구현 방식 |
|-----|----------|
| **비밀번호 암호화** | bcrypt (rounds: 10) |
| **JWT 인증** | HS256 서명 알고리즘 |
| **SQL Injection 방지** | Drizzle ORM 파라미터화 쿼리 |
| **XSS 방지** | React 자동 이스케이핑 |
| **CORS** | Express 미들웨어 설정 |
| **세션 쿠키** | httpOnly, secure (운영) |

### 보안 체크리스트
- [ ] HTTPS 전용 통신 (운영 환경)
- [ ] JWT Secret 환경 변수화
- [ ] 데이터베이스 연결 암호화
- [ ] Rate Limiting 추가 (선택사항)
- [ ] API Key 관리 (네이버 API)

---

## ⚡ 성능 최적화

### 프론트엔드 최적화
- **코드 스플리팅**: Vite 자동 번들 분할
- **지연 로딩**: React.lazy + Suspense
- **상태 캐싱**: React Query 5분 캐시
- **Virtual Scrolling**: 큰 테이블용 (추후 구현)

### 백엔드 최적화
- **데이터베이스 인덱싱**:
  - `idx_tracks_product_time` (productId, checkedAt)
  - `idx_statistics_product_period` (productId, type, periodStart)
- **병렬 크롤링**: 동시성 제한 (3-5개)
- **쿼리 최적화**: Drizzle ORM 기반
- **캐싱**: Redis 추가 가능 (향후)

---

## 🐛 디버깅 및 모니터링

### 로그 확인
```bash
# 서버 로그 (콘솔)
npm run dev

# 검색 상태 API
curl http://localhost:3000/api/search-status
```

### WebSocket 상태 확인
```typescript
// 클라이언트 콘솔
const { isConnected, connectionCount } = useWebSocket();
console.log('WebSocket 연결:', isConnected);
console.log('재연결 횟수:', connectionCount);
```

### 데이터베이스 쿼리 로깅
```typescript
// server/db.ts
// Drizzle 쿼리 로깅 활성화
logger: true
```

---

## 📝 중요 개발 지침

### 1. 레이아웃 유지
```typescript
// dashboard.tsx
// ⚠️ 이 스타일은 모바일 확대 기능을 위해 의도적으로 설정됨
<div className="flex h-screen bg-white dark:bg-gray-900"
     style={{ minWidth: '1920px', width: '1920px' }}>
```
**절대 제거하지 말 것!** 모바일에서 가로 스크롤로 확대해서 볼 수 있게 하는 기능입니다.

### 2. WebSocket 이벤트 처리
```typescript
// 검색 완료 시 반드시 캐시 무효화
case 'searchCompleted':
  queryClient.invalidateQueries({ queryKey: ['/api/products'] });
  if (message.data?.productId) {
    queryClient.invalidateQueries({
      queryKey: [`/products/${message.data.productId}/daily-ranks`]
    });
  }
  break;
```

### 3. 크롤러 순서
```typescript
// 1차: Naver OpenAPI (안정적)
// 2차: Puppeteer 폴백 (API 실패 시)
// 반드시 이 순서 유지!
```

### 4. 환경 변수 분리
- **개발**: `.env` 파일 사용
- **프로덕션**: `.env.production` 파일 사용
- **절대 커밋하지 말 것**: `.env` 파일은 `.gitignore`에 포함

### 5. 데이터베이스 마이그레이션
```bash
# 스키마 변경 시
npm run db:push

# 마이그레이션 적용
npm run db:migrate
```

---

## 🔧 향후 개선 사항

### 기술 부채
1. **Redis 캐싱**: 통계 데이터 캐싱
2. **Rate Limiting**: API 요청 제한
3. **메트릭 수집**: Prometheus/Grafana
4. **E2E 테스트**: Playwright 도입
5. **단위 테스트**: Jest + Testing Library

### 기능 확장
1. 다중 검색 엔진 (구글, 다음 등)
2. 가격 변동 알림 (WebSocket Push)
3. 경쟁사 모니터링
4. 예측 분석 (AI/ML)
5. 모바일 앱 (React Native)

---

## 📞 주요 경로 및 연락처

### 파일 절대 경로
- **프론트엔드 소스**: `/home/xpro/snaver/client/src/`
- **백엔드 소스**: `/home/xpro/snaver/server/`
- **공유 타입**: `/home/xpro/snaver/shared/schema.ts`
- **배포 스크립트**: `/home/xpro/snaver/client/scripts/deploy_client.sh`

### 실서버 정보
- **SSH**: `xpro@xpro0.cafe24.com`
- **배포 경로**: `/srv/xpro0/snaver/`
- **URL**: `https://podoo.co.kr/snaver/`

---

## 📚 참고 문서

### 외부 라이브러리
- [React Query 문서](https://tanstack.com/query/latest)
- [Drizzle ORM 문서](https://orm.drizzle.team/)
- [shadcn/ui 컴포넌트](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

### API 문서
- [네이버 쇼핑 검색 API](https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md)
- [네이버 로그인 API](https://developers.naver.com/docs/login/web/web.md)

---

**마지막 업데이트**: 2025-10-20
**작성자**: Claude Code
**버전**: 1.0.0
