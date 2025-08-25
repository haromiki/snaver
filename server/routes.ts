// routes.ts
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertProductSchema, loginSchema, rankQuerySchema, type RankQuery, type RankResult } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "./middleware/auth.js";
import { fetchOrganicRank } from "./crawler/naverOrganic.js";
import { fetchOrganicRankPuppeteer } from "./crawler/naverOrganicPuppeteer.js";
import { fetchAdRank } from "./crawler/adCrawler.js";
import crypto from "crypto";
import { searchLogger } from "./utils/searchLogger.js";

// 세션 타입 확장
declare module 'express-session' {
  interface SessionData {
    naverState?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check...
  app.get("/api/_health", (req, res) => {
    res.json({ ok: true, service: "snaver-api" });
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      // 👇️ DO NOT DELETE BELOW: Debug logging for register payload
      console.log("🔍 register 요청 데이터:", req.body);
      // 👆️ DO NOT DELETE ABOVE

      const validatedData = insertUserSchema.parse(req.body);

      const existingUser = await storage.getUserByUsername(validatedData.username) ||
                          await storage.getUserByEmail(validatedData.email);

      if (existingUser) {
        return res.status(400).json({ message: "이미 존재하는 사용자입니다" });
      }

      const passwordHash = await bcrypt.hash(validatedData.password, 12);
      const { password, ...userDataForStorage } = validatedData;
      const user = await storage.createUser({
        ...userDataForStorage,
        passwordHash,
      } as any);

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

      res.json({ 
        ok: true, 
        user: { id: user.id, username: user.username, email: user.email },
        token 
      });
    } catch (error: any) {
      console.error("회원가입 오류:", error);
      let message = "회원가입에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }

      res.status(400).json({ message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await storage.getUserByUsername(validatedData.usernameOrEmail) ||
                   await storage.getUserByEmail(validatedData.usernameOrEmail);

      if (!user) {
        return res.status(401).json({ message: "잘못된 로그인 정보입니다" });
      }

      const isPasswordValid = await bcrypt.compare(validatedData.password, user.passwordHash);

      if (!isPasswordValid) {
        return res.status(401).json({ message: "잘못된 로그인 정보입니다" });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

      res.json({ 
        ok: true, 
        user: { id: user.id, username: user.username, email: user.email },
        token 
      });
    } catch (error: any) {
      console.error("로그인 오류:", error);
      let message = "로그인에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }

      res.status(400).json({ message });
    }
  });

  // 네이버 OAuth 로그인 시작
  app.get("/api/auth/naver", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/naver/callback`;
    const state = crypto.randomBytes(32).toString('hex');
    
    // 상태값을 세션에 저장 (실제로는 Redis나 DB에 저장하는 것이 좋음)
    req.session = req.session || {};
    req.session.naverState = state;
    
    const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;
    
    res.redirect(naverAuthUrl);
  });

  // 네이버 OAuth 콜백 처리
  app.get("/api/auth/naver/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      const clientId = process.env.NAVER_CLIENT_ID;
      const clientSecret = process.env.NAVER_CLIENT_SECRET;
      
      // 상태값 검증
      if (!req.session?.naverState || req.session.naverState !== state) {
        return res.status(400).json({ message: "잘못된 상태값입니다" });
      }
      
      // Access Token 요청
      const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId!,
          client_secret: clientSecret!,
          code: code as string,
          state: state as string,
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        throw new Error('액세스 토큰을 받지 못했습니다');
      }
      
      // 사용자 정보 요청
      const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });
      
      const userData = await userResponse.json();
      
      if (userData.resultcode !== '00') {
        throw new Error('사용자 정보를 가져오지 못했습니다');
      }
      
      const naverUser = userData.response;
      
      // 기존 사용자 확인 또는 새 사용자 생성
      let user = await storage.getUserByEmail(naverUser.email);
      
      if (!user) {
        // 새 사용자 생성
        const username = naverUser.nickname || naverUser.name || `naver_${naverUser.id}`;
        user = await storage.createUser({
          username: username,
          email: naverUser.email,
          passwordHash: '', // 네이버 로그인 사용자는 비밀번호 없음
        } as any);
      }
      
      // JWT 토큰 생성
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      
      // 프론트엔드로 리다이렉트 (토큰을 쿼리 파라미터로 전달)
      res.redirect(`/?token=${token}&loginSuccess=true`);
      
    } catch (error: any) {
      console.error("네이버 로그인 오류:", error);
      res.redirect(`/?loginError=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }

      res.json({ 
        id: user.id, 
        username: user.username, 
        email: user.email 
      });
    } catch (error) {
      res.status(500).json({ message: "사용자 정보를 가져오는데 실패했습니다" });
    }
  });

  // Products routes
  app.get("/api/products", authenticateToken, async (req, res) => {
    try {
      const { type, active } = req.query;
      const filters: any = {};
      
      if (type) filters.type = type;
      if (active !== undefined) filters.active = active === 'true';
      
      const products = await storage.getProducts(req.userId!, filters);
      res.json(products);
    } catch (error) {
      console.error("제품 목록 조회 오류:", error);
      res.status(500).json({ message: "제품 목록을 가져오는데 실패했습니다" });
    }
  });

  app.post("/api/products", authenticateToken, async (req, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(product);
    } catch (error: any) {
      console.error("제품 추가 오류:", error);
      let message = "제품 추가에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }

      res.status(400).json({ message });
    }
  });

  app.patch("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // 제품 전체 정보 업데이트 또는 부분 업데이트 지원
      const updateData: any = {};
      if (req.body.productName !== undefined) updateData.productName = req.body.productName;
      if (req.body.productNo !== undefined) updateData.productNo = req.body.productNo;
      if (req.body.keyword !== undefined) updateData.keyword = req.body.keyword;
      if (req.body.type !== undefined) updateData.type = req.body.type;
      if (req.body.intervalMin !== undefined) updateData.intervalMin = req.body.intervalMin;
      if (req.body.active !== undefined) updateData.active = req.body.active;
      
      const updatedProduct = await storage.updateProduct(productId, req.userId!, updateData);
      res.json(updatedProduct);
    } catch (error: any) {
      console.error("제품 업데이트 오류:", error);
      res.status(400).json({ message: "제품 업데이트에 실패했습니다" });
    }
  });

  app.post("/api/products/:id/refresh", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // 제품 정보 조회
      const product = await storage.getProduct(productId, req.userId!);
      if (!product) {
        return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      }

      let rankResult: RankResult;

      if (product.type === "organic") {
        // 일반(오가닉) 순위 조회 - 실서버 환경 최적화 (OpenAPI 우선, Puppeteer fallback)
        const clientId = process.env.NAVER_CLIENT_ID;
        const clientSecret = process.env.NAVER_CLIENT_SECRET;
        
        if (clientId && clientSecret) {
          console.log(`📡 수동 검색 - OpenAPI 사용 (제품 ${product.id})`);
          try {
            rankResult = await fetchOrganicRank({
              keyword: product.keyword,
              productId: product.productNo,
              clientId,
              clientSecret,
            });
          } catch (error: any) {
            console.log(`❌ OpenAPI 실패 - 실서버에서 Puppeteer 미사용 (제품 ${product.id}):`, error.message);
            // 실서버 안전성: Puppeteer fallback 제거
            rankResult = {
              productId: product.productNo,
              found: false,
              notes: [`OpenAPI 오류: ${error.message}`]
            };
          }
        } else {
          console.log(`❌ OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용 (제품 ${product.id})`);
          rankResult = {
            productId: product.productNo,
            found: false,
            notes: ["OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용"]
          };
        }
      } else {
        // 광고 순위 조회 - Puppeteer만 가능
        console.log(`🎯 수동 검색 - 광고 검색 (제품 ${product.id})`);
        rankResult = await fetchAdRank({
          productId: product.productNo,
          keyword: product.keyword,
          maxPages: 5,
        });
      }

      // 검색 결과 (프로덕션에서는 로그 제거)

      // 트랙 데이터 저장 - found 여부와 관계없이 항상 저장
      await storage.createTrack({
        productId: product.id,
        isAd: product.type === "ad",
        page: rankResult.found ? (rankResult.page || null) : null,
        rankOnPage: rankResult.found ? (rankResult.rankInPage || null) : null,
        globalRank: rankResult.found ? (rankResult.globalRank || null) : null,
        priceKrw: rankResult.found ? (rankResult.price || null) : null,
        mallName: rankResult.found ? (rankResult.storeName || null) : null,
        productLink: rankResult.found ? (rankResult.storeLink || null) : null,
      });

      res.json({ 
        success: true, 
        message: "순위 업데이트가 완료되었습니다",
        result: rankResult 
      });
    } catch (error: any) {
      console.error("제품 새로고침 오류:", error);
      res.status(400).json({ message: "제품 새로고침에 실패했습니다" });
    }
  });

  app.post("/api/products/sort", authenticateToken, async (req, res) => {
    try {
      const { productIds } = req.body;
      await storage.updateProductSortOrder(req.userId!, productIds);
      res.json({ success: true });
    } catch (error: any) {
      console.error("제품 정렬 오류:", error);
      res.status(400).json({ message: "제품 정렬에 실패했습니다" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      await storage.deleteProduct(productId, req.userId!);
      res.json({ success: true, message: "제품이 삭제되었습니다" });
    } catch (error: any) {
      console.error("제품 삭제 오류:", error);
      res.status(400).json({ message: "제품 삭제에 실패했습니다" });
    }
  });

  // 새로운 랭킹 시스템 API
  // 일반(오가닉) 순위 조회 - Naver OpenAPI 사용
  // 🔍 임시 디버깅 엔드포인트 - API 응답 구조 확인
  app.post("/api/debug/naver-api", async (req, res) => {
    try {
      const { keyword = "주차번호판" } = req.body;
      
      const clientId = process.env.NAVER_OPENAPI_CLIENT_ID;
      const clientSecret = process.env.NAVER_OPENAPI_CLIENT_SECRET;
      
      console.log("🔑 API 키 확인:", !!clientId, !!clientSecret);
      
      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: "API 인증정보 없음", clientId: !!clientId, clientSecret: !!clientSecret });
      }

      const { start = 1 } = req.body;
      // 네이버 쇼핑 검색 파라미터 최적화
      const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=100&start=${start}&sort=sim`;
      
      console.log("🌐 요청 URL:", url);
      
      // Node.js built-in fetch 명시적 사용  
      const response = await globalThis.fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "User-Agent": "SNAVER/1.0",
        },
      });

      console.log("📡 응답 상태:", response.status, response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("❌ API 에러 응답:", errorText);
        return res.status(500).json({ error: `API 오류: ${response.status}`, details: errorText });
      }

      const data = await response.json();
      
      console.log("✅ API 응답 수신:", {
        total: data.total,
        itemsCount: data.items?.length,
        firstItemKeys: data.items?.[0] ? Object.keys(data.items[0]) : []
      });
      
      // 특정 제품 검색 및 전체 응답 분석
      const targetProductId = "5797852571";
      const matchingItems = data.items?.filter((item: any) => 
        String(item.productId).includes(targetProductId) || 
        targetProductId.includes(String(item.productId))
      ) || [];
      
      // 응답 구조와 첫 10개 아이템 반환
      return res.json({
        keyword,
        searchingFor: targetProductId,
        totalCount: data.total || 0,
        itemsLength: data.items?.length || 0,
        startPosition: start,
        matchingItems: matchingItems.length > 0 ? matchingItems : "미발견",
        firstItems: data.items?.slice(0, 10).map((item: any) => ({
          productId: item.productId,
          mallName: item.mallName,
          title: item.title,
          lprice: item.lprice,
          link: item.link,
          productType: item.productType,
          allKeys: Object.keys(item)
        })) || [],
        // 모든 productId 목록도 포함
        allProductIds: data.items?.map((item: any) => item.productId) || [],
        success: true
      });
      
    } catch (error: any) {
      console.error("🚨 디버깅 API 오류:", error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  app.post("/api/rank/organic", async (req, res) => {
    try {
      const validatedData = rankQuerySchema.parse(req.body);
      
      // 실서버 환경 최적화: OpenAPI 우선, Puppeteer fallback
      const clientId = process.env.NAVER_CLIENT_ID;
      const clientSecret = process.env.NAVER_CLIENT_SECRET;
      
      let result: RankResult;
      
      if (clientId && clientSecret) {
        console.log(`📡 OpenAPI 우선 사용 - 키워드: "${validatedData.keyword}"`);
        try {
          result = await fetchOrganicRank({
            keyword: validatedData.keyword,
            productId: validatedData.productId,
            clientId,
            clientSecret,
          });
        } catch (error: any) {
          console.log(`❌ OpenAPI 실패 - 실서버에서 Puppeteer 미사용:`, error.message);
          // 실서버 안전성: Puppeteer fallback 제거
          result = {
            productId: validatedData.productId,
            found: false,
            notes: [`OpenAPI 오류: ${error.message}`]
          };
        }
      } else {
        console.log(`❌ OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용`);
        result = {
          productId: validatedData.productId,
          found: false,
          notes: ["OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용"]
        };
      }

      res.json(result);
    } catch (error: any) {
      console.error("일반 순위 조회 오류:", error);
      let message = "일반 순위 조회에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }

      res.status(500).json({ message });
    }
  });

  // 1주일 순위 트렌드 데이터 API
  app.get("/api/products/:id/weekly-ranks", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // 월요일 기준으로 이번 주 시작일 계산
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 일요일이면 6일 전, 아니면 현재요일-1
      
      const thisWeekMonday = new Date(now);
      thisWeekMonday.setDate(now.getDate() - daysFromMonday);
      thisWeekMonday.setHours(0, 0, 0, 0);
      
      const nextWeekMonday = new Date(thisWeekMonday);
      nextWeekMonday.setDate(thisWeekMonday.getDate() + 7);
      
      // 이번 주 데이터 조회 (월요일 00:00 ~ 다음주 월요일 00:00 전까지)
      const weeklyRanks = await storage.getProductTracksInRange(
        productId, 
        req.userId!,
        thisWeekMonday.toISOString(),
        nextWeekMonday.toISOString()
      );
      
      // 요일별 최신 순위 데이터로 정리 (7일간)
      const dailyRanks = [];
      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(thisWeekMonday);
        targetDate.setDate(thisWeekMonday.getDate() + i);
        
        const dayName = ['월', '화', '수', '목', '금', '토', '일'][i];
        
        // 해당 날짜의 트랙 데이터 중 가장 최근 것
        const dayTracks = weeklyRanks.filter((track: any) => {
          const trackDate = new Date(track.checkedAt);
          return trackDate.toDateString() === targetDate.toDateString();
        });
        
        const latestTrack = dayTracks.length > 0 ? 
          dayTracks.sort((a: any, b: any) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0] : null;
        
        dailyRanks.push({
          day: dayName,
          date: targetDate.toISOString().split('T')[0],
          rank: latestTrack?.globalRank || null,
          hasData: !!latestTrack
        });
      }
      
      res.json({
        productId,
        weekStart: thisWeekMonday.toISOString().split('T')[0],
        dailyRanks
      });
      
    } catch (error) {
      console.error("1주일 순위 데이터 조회 오류:", error);
      res.status(500).json({ message: "1주일 순위 데이터를 가져오는데 실패했습니다" });
    }
  });

  // 광고 순위 조회 - Puppeteer 사용 (테스트용 인증 제거)
  app.post("/api/rank/ad", async (req, res) => {
    try {
      console.log("[API] /api/rank/ad 호출됨");
      const validatedData = rankQuerySchema.parse(req.body);
      console.log("[API] 요청 데이터 검증 완료:", validatedData);

      console.log("[API] fetchAdRank 호출 시작");
      const result = await fetchAdRank({
        productId: validatedData.productId,
        keyword: validatedData.keyword,
        maxPages: validatedData.maxPages || 5,
      });
      console.log("[API] fetchAdRank 호출 완료:", result);

      res.json(result);
    } catch (error: any) {
      console.error("광고 순위 조회 오류:", error);
      let message = "광고 순위 조회에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }

      res.status(500).json({ message });
    }
  });

  // Tracks routes
  app.get("/api/tracks", authenticateToken, async (req, res) => {
    try {
      const { product_id, from, to } = req.query;
      const productId = parseInt(product_id as string);
      
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;
      
      const tracks = await storage.getTracks(productId, fromDate, toDate);
      res.json(tracks);
    } catch (error) {
      console.error("트랙 조회 오류:", error);
      res.status(500).json({ message: "트랙 데이터를 가져오는데 실패했습니다" });
    }
  });

  // 검색 로그 API 엔드포인트들
  app.get("/api/search/debug/:searchId", authenticateToken, async (req, res) => {
    try {
      const searchId = req.params.searchId;
      
      // 특정 검색의 상세 로그 조회
      const logs = searchLogger.getSearchLogs(searchId);
      
      res.json({
        searchId,
        logs,
        logCount: logs.length
      });
    } catch (error: any) {
      console.error("검색 로그 조회 오류:", error);
      res.status(500).json({ message: "검색 로그 조회에 실패했습니다" });
    }
  });

  app.get("/api/search/stats", authenticateToken, async (req, res) => {
    try {
      // 환경별 성공률 통계
      const stats = searchLogger.getStats();
      const recentLogs = searchLogger.getRecentLogs(20);
      
      res.json({
        stats,
        recentLogs,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("검색 통계 조회 오류:", error);
      res.status(500).json({ message: "검색 통계 조회에 실패했습니다" });
    }
  });

  app.get("/api/search/export", authenticateToken, async (req, res) => {
    try {
      // 로그 내보내기 (실서버 디버깅용)
      const exportData = searchLogger.exportLogs();
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="search-logs.json"');
      res.send(exportData);
    } catch (error: any) {
      console.error("로그 내보내기 오류:", error);
      res.status(500).json({ message: "로그 내보내기에 실패했습니다" });
    }
  });

  // 실서버 로그 파일 조회
  app.get("/api/search/file", authenticateToken, async (req, res) => {
    try {
      const logFileContent = searchLogger.readLogFile();
      const logFileInfo = searchLogger.getLogFileInfo();
      
      res.json({
        fileInfo: logFileInfo,
        content: logFileContent,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("로그 파일 조회 오류:", error);
      res.status(500).json({ message: "로그 파일 조회에 실패했습니다" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
