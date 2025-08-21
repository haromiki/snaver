# Overview

SNAVER is a production-ready web application designed to track store rankings on Naver Shopping by keyword. The system allows users to monitor both advertisement and organic product rankings through automated crawling and provides a clean dashboard interface for managing products and viewing ranking statistics. The application is optimized for PC usage and features a professional Korean-language interface with real-time tracking capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.
Preferred language: Korean (한국어)

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