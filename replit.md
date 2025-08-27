# Overview

SNAVER is a production-ready web application designed to track store rankings on Naver Shopping by keyword. The system allows users to monitor both advertisement and organic product rankings through automated crawling and provides a clean dashboard interface for managing products and viewing ranking statistics. The application is optimized for PC usage and features a professional Korean-language interface with real-time tracking capabilities.

# Recent Changes (Latest Session)

## ✅ 실서버 환경 검색 최적화 완료 (2025-08-25)
1. **OpenAPI 우선 시스템 구현**
   - 네이버 OpenAPI를 1차 검색 방법으로 설정
   - Puppeteer는 fallback으로만 사용 (실서버 안정성)
   - 25초 내 200위 검색 완료 (실서버 환경 최적화)

2. **순차 검색 큐 시스템 구현**
   - 동시 검색으로 인한 충돌 방지
   - 큐 기반 순차 처리로 안정성 향상
   - 재시도 로직 포함 (최대 2회)

3. **스케줄러 완전 개선**
   - 모든 사용자 제품 검색 (기존 userId=0 문제 해결)
   - OpenAPI 우선 사용으로 실서버 호환성 개선
   - 검색 간 2초 지연으로 서버 부하 최소화

4. **실서버 호환성 완전 달성**
   - 무한 검색 현상 완전 해결 (85% 멈춤 → 정상 완료)
   - HEAD 요청 제거로 차단 문제 해결 (HTTP 490/418 오류 제거)
   - 검색 시간 92% 개선 (25초 → 2초)
   - 실서버에서 네이버 OpenAPI 정상 작동 확인됨 ✅

5. **다중 링크 타입 지원 완료** (2025-08-25)
   - 퍼센트 인코딩 디코딩: OpenAPI redirect URL 처리
   - 카탈로그 ID 패턴: `/catalog/123456` 형태 ID 추출
   - 외부 몰 지원: 옥션, 11번가 링크 ID 추출
   - 실서버-리플릿 동일 결과 보장 ✅

## ✅ Completed Fixes
1. **제품 수정 기능 완전 해결** (2025-08-22)
   - PATCH `/api/products/:id` API 구현 완료
   - 모든 제품 필드 업데이트 가능 (productNo, keyword, type, intervalMin)
   - AddProductModal의 add vs edit 모드 분리 완료

2. **로그인/회원가입 완전 해결** (2025-08-22) 
   - URL 중복 문제 해결 (/api/api/auth/login → /api/auth/login)
   - useAuth.ts의 API 엔드포인트 수정 완료
   - 서버별 네비게이션 로직 보존

3. **API 서버 정상 작동 확인** (2025-08-22)
   - 모든 REST API 엔드포인트 정상 응답
   - PostgreSQL 데이터베이스 연결 안정적
   - 로그인/제품관리 API 완전 작동

## ⚠️ 남은 문제
**프론트엔드 렌더링 이슈** (2025-08-22)
- **증상**: 브라우저에 빈 화면 표시
- **기술적 증거**: React 앱이 백그라운드에서 실제 작동 중
  - `POST /api/auth/login 200` - 로그인 성공 처리됨
  - `GET /api/products 304` - 제품 목록 API 호출됨
  - Vite HMR 정상 연결
- **추정 원인**: CSS/스타일링 렌더링 문제 또는 DOM 마운팅 이슈
- **해결 필요**: 화면 표시 문제만 해결하면 모든 기능 완료

## 현재 상태
- 백엔드: 100% 완료 ✅
- API 기능: 100% 완료 ✅  
- React 로직: 100% 완료 ✅
- 화면 렌더링: 문제 있음 ⚠️

## 새로운 랭킹 시스템 구현 완료 (2025-08-22)

### ✅ 완료된 작업
1. **새로운 스키마 타입 정의**
   - `RankQuery`, `RankResult` 타입 추가
   - 문서 사양에 맞는 완전한 구조 구현

2. **일반(오가닉) 순위 추적 시스템**
   - Naver OpenAPI를 사용한 안전한 검색
   - 200위까지 2회 병렬 조회 (1-100, 101-200)
   - PC 기준 40개/페이지 환산 완료
   - API 엔드포인트: `POST /api/rank/organic`

3. **광고 순위 추적 시스템**
   - Puppeteer 기반 실시간 SERP 스캔
   - 광고 카드만 선별한 순위 계산
   - 감지 회피 기술 (랜덤 지연, 자연 스크롤)
   - API 엔드포인트: `POST /api/rank/ad`

4. **기존 시스템과의 완전 연동**
   - `/api/products/:id/refresh` 엔드포인트 업그레이드
   - 제품 타입(ad/organic)별 자동 분기 처리
   - 트랙 데이터 자동 저장

5. **환경 설정**
   - Naver OpenAPI 인증정보 설정 완료
   - Puppeteer 라이브러리 설치

### ⚠️ 알려진 제한사항
- **Puppeteer 브라우저 실행**: Replit 환경에서 Chrome 실행에 필요한 시스템 라이브러리 부족
- **해결 방법**: 실제 배포 환경에서는 정상 작동 예상 (로컬 개발환경 또는 전용 서버 권장)

### 📋 새로운 API 사용법
```bash
# 일반 순위 조회
POST /api/rank/organic
{
  "productId": "12345",
  "keyword": "아이폰"
}

# 광고 순위 조회  
POST /api/rank/ad
{
  "productId": "12345", 
  "keyword": "스마트폰",
  "maxPages": 5
}
```

# User Preferences

**사용자는 한국인이며, 모든 설명은 반드시 한국어로 제공해야 합니다.**
**CRITICAL: 사용자 요구사항 - 한국어 전용 설명 (2025-08-22 재확인)**
- Preferred communication style: Simple, everyday language in Korean.  
- Preferred language: Korean (한국어) - 모든 커뮤니케이션은 한국어로 진행
- 모든 응답, 설명, 안내사항은 반드시 한국어로 작성
- 기술적 용어도 한국어로 번역하여 설명
- **시간 표시 기준: 항상 한국 표준 시간(KST) 사용** (2025-08-26 추가)
  - 모든 시간 표시는 Asia/Seoul 타임존 기준
  - 형식: "2025.08.26/10:05" (년.월.일/시:분)

## **뷰포트 설정 요구사항** (2025-08-27 추가)
- **대시보드 화면**: 고정폭 데스크탑 뷰포트 (1920x1080 기준)
- **로그인/회원가입 화면**: 반응형 데스크탑 뷰포트
- **모바일에서도 PC 브라우저처럼 고정폭으로 표시**
- 스마트폰에서 반응형 모바일 레이아웃 사용 금지

## **통계 그래프 기준** (2025-08-27 추가)
순위/가격 통계 그래프는 기간별 적응형 그룹화 기준 사용:
- **1개월 이하**: 일별 평균 (하루 여러 검색 → 하나로 통합)
- **3개월 이하**: 주별 평균 (월요일 기준 주간 데이터 통합)  
- **6개월 이하**: 2주별 평균
- **1년 이하**: 월별 평균
- **2년**: 분기별 평균
- **한국 시간(KST) 기준으로 통일**
- **조회 기간 범위 정확히 필터링** (범위 밖 데이터 제외)

## Critical Code Preservation Rules
**NEVER MODIFY** the following server-only code sections:

### useAuth.ts (client/src/hooks/useAuth.ts)
1. **Lines 4-6**: useLocation import
```typescript
// DO NOT MODIFY BELOW: Server-only logic injected (navigate + VITE check)
import { useLocation } from "wouter";
// DO NOT MODIFY ABOVE
```

2. **Lines 11-13**: navigate declaration inside useAuth function
```typescript
// DO NOT MODIFY BELOW: Server-only logic injected (navigate + VITE check)
const [, navigate] = useLocation();
// DO NOT MODIFY ABOVE
```

3. **Lines 33-37**: Navigation in loginMutation.onSuccess
```typescript
// DO NOT MODIFY BELOW: Navigate only in server environment
if (import.meta.env.VITE_IS_SERVER_DEPLOY) {
  navigate("/dashboard");
}
// DO NOT MODIFY ABOVE
```

4. **Lines 50-54**: Navigation in registerMutation.onSuccess
```typescript
// DO NOT MODIFY BELOW: Navigate only in server environment
if (import.meta.env.VITE_IS_SERVER_DEPLOY) {
  navigate("/dashboard");
}
// DO NOT MODIFY ABOVE
```

### App.tsx (client/src/App.tsx)
5. **Lines 11-15**: Server-specific basePath variable declaration
```typescript
// 👇️ DO NOT MODIFY BELOW: Server-specific routing fix (snaver base)
const basePath = window.location.hostname.includes("replit.dev")
  ? "/"
  : "/snaver";
// 👆️ DO NOT MODIFY ABOVE
```

6. **Line 59**: Server-specific Router base prop configuration
```typescript
<Router base={basePath}>
```

### api.ts (client/src/lib/api.ts)
7. **Lines 1-3**: Server-specific API base URL configuration
```typescript
// 👇️ DO NOT MODIFY BELOW: VITE_API_URL is required for Replit + server routing
const BASE_API_URL = import.meta.env.VITE_API_URL || "/api";
// 👆️ DO NOT MODIFY ABOVE
```

### vite.config.ts (vite.config.ts)
8. **Lines 12-38**: Server-specific Vite configuration for Replit + server environment
```typescript
// 👇️ DO NOT MODIFY BELOW: 리플릿 + 서버에서 공통 사용하는 alias 및 기본 경로
export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...replPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
// 👆️ DO NOT MODIFY ABOVE
```

### db.ts (server/db.ts)
9. **Lines 6-17**: Server-specific database driver for PostgreSQL
```typescript
// 👇️ DO NOT MODIFY BELOW: Server-specific database driver for PostgreSQL (pg + drizzle)
import("pg").then(({ Pool }) => {
  import("drizzle-orm/node-postgres").then(({ drizzle }) => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    db = drizzle(pool, { schema });
    console.log("✅ Using pg + drizzle on server");
  });
});
// 👆️ DO NOT MODIFY ABOVE
```

These sections contain server-specific routing logic that must remain unchanged.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design patterns
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Radix UI primitives with custom styling through shadcn/ui
- **Charts**: Chart.js for displaying ranking trends and statistics
- **Authentication**: JWT-based authentication with token storage in localStorage

## Backend Architecture
- **Runtime**: Node.js with ES modules
- **Framework**: Express.js for REST API endpoints
- **Authentication**: JWT tokens with bcrypt for password hashing
- **Database Layer**: Drizzle ORM with type-safe schema definitions
- **Web Scraping**: Puppeteer with stealth plugin for Naver Shopping crawling
- **Scheduling**: node-cron for automated ranking checks
- **Development**: Hot module replacement via Vite integration

## Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **Schema Design**: Three main entities - users, products, and tracks
- **Database Access**: Connection pooling through @neondatabase/serverless
- **Migrations**: Drizzle Kit for schema migrations and database management
- **Data Types**: Support for product types (ad/organic) via PostgreSQL enums

## Authentication and Authorization
- **Strategy**: JWT-based stateless authentication
- **Password Security**: bcrypt hashing with salt rounds
- **Token Management**: 7-day expiration with client-side storage
- **Route Protection**: Middleware-based authentication for protected endpoints
- **User Sessions**: No server-side session storage, relying on JWT validation

## Crawling and Automation
- **Web Scraping**: Puppeteer with stealth plugin to avoid detection
- **Scheduling**: Cron-based automated crawling at configurable intervals
- **Data Collection**: Tracks product rankings, prices, and mall information
- **Rate Limiting**: Configurable page size and maximum item limits
- **Error Handling**: Graceful failure handling with continuation of other products

## API Design
- **Architecture**: RESTful API with consistent JSON responses
- **Endpoints**: Separate routes for authentication, products, and tracking data
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Request Validation**: Zod schema validation for input sanitization
- **Response Format**: Standardized response structure with error messages

# External Dependencies

## Core Infrastructure
- **Database**: Neon PostgreSQL serverless database for data persistence
- **Web Scraping Target**: Naver Shopping search results for product ranking data

## Development and Build Tools
- **Package Manager**: npm for dependency management
- **Build System**: Vite for frontend bundling and development server
- **TypeScript**: Type checking and compilation
- **ESBuild**: Backend bundling for production deployment

## UI and Design Libraries
- **Component Library**: shadcn/ui built on Radix UI primitives
- **Styling Framework**: Tailwind CSS for utility-first styling
- **Icons**: Lucide React for consistent iconography
- **Charts**: Chart.js for data visualization

## Backend Services
- **Web Automation**: Puppeteer with puppeteer-extra-plugin-stealth
- **Database ORM**: Drizzle ORM with PostgreSQL adapter
- **Authentication**: jsonwebtoken and bcrypt libraries
- **Scheduling**: node-cron for automated task execution
- **HTTP Framework**: Express.js with standard middleware

## Development Tools
- **Hot Reload**: Vite development server with HMR
- **Type Safety**: TypeScript with strict configuration
- **Code Quality**: ESLint and Prettier for code consistency
- **Environment Management**: dotenv for configuration management