// routes.ts
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertProductSchema, insertKeywordSchema, loginSchema, rankQuerySchema, type RankQuery, type RankResult } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "./middleware/auth.ts";
import { fetchOrganicRank } from "./crawler/naverOrganic.js";
import { fetchOrganicRankPuppeteer } from "./crawler/naverOrganicPuppeteer.js";
import { fetchAdRank } from "./crawler/adCrawler.js";
import { getSearchStatus } from "./services/scheduler.js";
import crypto from "crypto";
import { setupWebSocket } from "./websocket";

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

  // 아이디 중복체크 API
  app.get("/api/auth/check-username/:username", async (req, res) => {
    try {
      const { username } = req.params;
      
      if (!username || username.length < 3) {
        return res.json({ 
          available: false,
          message: "아이디는 3자 이상이어야 합니다"
        });
      }

      const existingUser = await storage.getUserByUsername(username);
      
      res.json({ 
        available: !existingUser,
        message: existingUser ? "이미 사용 중인 아이디입니다" : "사용 가능한 아이디입니다"
      });
    } catch (error) {
      console.error("아이디 중복체크 오류:", error);
      res.status(500).json({ message: "중복체크에 실패했습니다" });
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      // 👇️ DO NOT DELETE BELOW: Debug logging for register payload
      console.log("🔍 register 요청 데이터:", req.body);
      // 👆️ DO NOT DELETE ABOVE

      const validatedData = insertUserSchema.parse(req.body);

      // 아이디 중복 확인
      const existingUserByUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "이미 사용 중인 아이디입니다" });
      }

      // 이메일이 제공된 경우에만 이메일 중복 확인
      if (validatedData.email) {
        const existingUserByEmail = await storage.getUserByEmail(validatedData.email);
        if (existingUserByEmail) {
          return res.status(400).json({ message: "이미 사용 중인 이메일입니다" });
        }
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
        user: { id: user.id, username: user.username, email: user.email || null },
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

  // 비밀번호 변경 API
  app.patch("/api/auth/change-password", authenticateToken, async (req, res) => {
    try {
      const userId = req.userId!;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" 
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ 
          message: "새 비밀번호는 8자 이상이어야 합니다" 
        });
      }

      // 현재 사용자 정보 조회
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }

      // 현재 비밀번호 확인
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "현재 비밀번호가 올바르지 않습니다" });
      }

      // 새 비밀번호 해시화
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // 비밀번호 업데이트
      await storage.updateUserPassword(userId, newPasswordHash);

      res.json({ 
        ok: true, 
        message: "비밀번호가 성공적으로 변경되었습니다" 
      });
    } catch (error: any) {
      console.error("비밀번호 변경 오류:", error);
      res.status(500).json({ 
        message: "비밀번호 변경에 실패했습니다" 
      });
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
      
      // 한국 시간(KST, UTC+9) 기준으로 이번 주 시작일 계산
      const now = new Date();
      // 한국 시간으로 변환 (UTC+9)
      const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const dayOfWeek = kstNow.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 일요일이면 6일 전, 아니면 현재요일-1
      
      // 한국 시간 기준 이번 주 월요일 00:00
      const thisWeekMonday = new Date(kstNow.getTime() - (daysFromMonday * 24 * 60 * 60 * 1000));
      thisWeekMonday.setHours(0, 0, 0, 0);
      
      // 다음 주 월요일 00:00
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
        
        // 해당 날짜의 트랙 데이터 중 가장 최근 것 (한국 시간 기준)
        const dayTracks = weeklyRanks.filter((track: any) => {
          const trackDate = new Date(track.checkedAt);
          // 한국 시간으로 변환하여 날짜 비교
          const kstTrackDate = new Date(trackDate.getTime() + (9 * 60 * 60 * 1000));
          const kstTargetDate = new Date(targetDate.getTime() + (9 * 60 * 60 * 1000));
          return kstTrackDate.toDateString() === kstTargetDate.toDateString();
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

  // 24시간 순위 트렌드 데이터 API
  app.get("/api/products/:id/daily-ranks", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // 한국 시간(KST, UTC+9) 기준으로 오늘 시작 시간 계산
      const now = new Date();
      const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      
      // 오늘 00:00 (한국 시간)
      const todayStartKST = new Date(kstNow);
      todayStartKST.setHours(0, 0, 0, 0);
      
      // UTC 기준으로 오늘 하루 범위 계산 (어제 15:00 ~ 오늘 15:00)
      const todayStart = new Date(todayStartKST.getTime() - (9 * 60 * 60 * 1000));
      const tomorrowStart = new Date(todayStart.getTime() + (24 * 60 * 60 * 1000));
      
      console.log(`[Daily Ranks API] 제품 ${productId} - 검색 범위: ${todayStart.toISOString()} ~ ${tomorrowStart.toISOString()}`);
      console.log(`[Daily Ranks API] KST 기준: ${todayStartKST.toISOString().split('T')[0]}`);
      
      // 24시간 데이터 조회 (UTC 기준)
      const dailyTracks = await storage.getProductTracksInRange(
        productId, 
        req.userId!,
        todayStart.toISOString(),
        tomorrowStart.toISOString()
      );
      
      console.log(`[Daily Ranks API] 조회된 tracks 개수: ${dailyTracks.length}개`);
      if (dailyTracks.length > 0) {
        console.log(`[Daily Ranks API] 첫 번째 track:`, {
          checkedAt: dailyTracks[0].checkedAt,
          rank: dailyTracks[0].globalRank
        });
      }

      // 시간별 최신 순위 데이터로 정리 (24시간, UTC 기준)
      const hourlyRanks = [];
      for (let i = 0; i < 24; i++) {
        const targetHourUTC = new Date(todayStart.getTime() + (i * 60 * 60 * 1000));
        const nextHourUTC = new Date(todayStart.getTime() + ((i + 1) * 60 * 60 * 1000));
        
        // 해당 시간대의 트랙 데이터 중 가장 최근 것 (UTC 기준)
        const hourTracks = dailyTracks.filter((track: any) => {
          const trackDate = new Date(track.checkedAt);
          return trackDate >= targetHourUTC && trackDate < nextHourUTC;
        });
        
        const latestTrack = hourTracks.length > 0 ? 
          hourTracks.sort((a: any, b: any) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0] : null;
        
        // 한국시간으로 표시하기 위해 +9시간
        const kstHour = new Date(targetHourUTC.getTime() + (9 * 60 * 60 * 1000));
        
        if (i === 18 || i === 19) { // 18시, 19시 디버깅
          console.log(`[Daily Ranks API] ${i}시 검색:`, {
            targetHour: targetHourUTC.toISOString(),
            nextHour: nextHourUTC.toISOString(),
            hourTracks: hourTracks.length,
            latestRank: latestTrack?.globalRank
          });
        }
        
        hourlyRanks.push({
          hour: kstHour.getHours().toString().padStart(2, '0') + ':00',
          time: targetHourUTC.toISOString(),
          rank: latestTrack?.globalRank || null,
          hasData: !!latestTrack
        });
      }
      
      res.json({
        productId,
        dayStart: todayStartKST.toISOString().split('T')[0],
        hourlyRanks
      });
      
    } catch (error) {
      console.error("24시간 순위 데이터 조회 오류:", error);
      res.status(500).json({ message: "24시간 순위 데이터를 가져오는데 실패했습니다" });
    }
  });

  // 가격 히스토리 조회 API
  app.get("/api/products/:id/price-history", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { range = '1year' } = req.query;
      
      // 날짜 범위 계산
      const now = new Date();
      let fromDate: Date;
      
      switch (range) {
        case '1month':
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '3months':
          fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '6months':
          fromDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case '2years':
          fromDate = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
          break;
        default: // '1year'
          fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
      }
      
      // 가격 데이터가 있는 트랙들만 조회
      const tracks = await storage.getTracks(productId, fromDate, now);
      const tracksWithPrice = tracks.filter(track => track.priceKrw && track.priceKrw > 0);
      
      if (tracksWithPrice.length === 0) {
        return res.json({
          data: [],
          stats: {
            current: 0,
            highest: 0,
            lowest: 0,
            average: 0
          }
        });
      }
      
      // 주간별로 데이터 그룹화 (같은 주의 데이터는 평균 가격 사용)
      const weeklyData = new Map<string, { prices: number[], date: string }>();
      
      tracksWithPrice.forEach(track => {
        if (!track.checkedAt) return; // null 체크 추가
        const trackDate = new Date(track.checkedAt);
        // 월요일 시작하는 주의 시작일 계산
        const dayOfWeek = trackDate.getDay();
        const diff = trackDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(trackDate.setDate(diff));
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, { 
            prices: [], 
            date: weekKey // ISO 날짜 문자열 사용 (YYYY-MM-DD)
          });
        }
        
        weeklyData.get(weekKey)!.prices.push(track.priceKrw!);
      });
      
      // 주간 평균 가격 계산
      const chartData = Array.from(weeklyData.entries())
        .map(([date, data]) => ({
          date: data.date,
          price: Math.round(data.prices.reduce((sum, price) => sum + price, 0) / data.prices.length)
        }))
        .sort((a, b) => a.date.localeCompare(b.date)); // 문자열 정렬로 변경
      
      // 통계 계산
      const allPrices = tracksWithPrice.map(t => t.priceKrw!);
      
      // 현재 가격: 가장 최근 checked_at 시간 기준으로 정렬하여 가져오기
      const sortedByTime = tracksWithPrice
        .filter(track => track.checkedAt) // null 체크 추가
        .sort((a, b) => 
          new Date(b.checkedAt!).getTime() - new Date(a.checkedAt!).getTime()
        );
      
      const stats = {
        current: sortedByTime[0]?.priceKrw || 0,
        highest: Math.max(...allPrices),
        lowest: Math.min(...allPrices),
        average: Math.round(allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length)
      };
      
      res.json({
        data: chartData,
        stats
      });
      
    } catch (error) {
      console.error("가격 히스토리 조회 오류:", error);
      res.status(500).json({ message: "가격 히스토리를 가져오는데 실패했습니다" });
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

  // 자동 검색 진행상태 API
  app.get("/api/search-status", authenticateToken, async (req, res) => {
    try {
      const status = getSearchStatus();
      res.json(status);
    } catch (error) {
      console.error("검색 상태 조회 오류:", error);
      res.status(500).json({ message: "검색 상태를 가져오는데 실패했습니다" });
    }
  });

  // 회원탈퇴 API
  app.delete("/api/auth/delete-account", authenticateToken, async (req, res) => {
    try {
      const { password, confirmText } = req.body;
      const userId = (req as any).user.id;

      // 확인 텍스트 검증
      if (confirmText !== "회원탈퇴") {
        return res.status(400).json({ message: "확인 텍스트가 일치하지 않습니다" });
      }

      // 현재 사용자 정보 가져오기
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }

      // 비밀번호 확인
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다" });
      }

      // 사용자와 관련된 모든 데이터 삭제
      await storage.deleteUser(userId);

      res.json({ message: "계정이 성공적으로 삭제되었습니다" });
    } catch (error) {
      console.error("회원탈퇴 오류:", error);
      res.status(500).json({ message: "계정 삭제에 실패했습니다" });
    }
  });

  // Keywords API endpoints
  // Get user keywords
  app.get("/api/keywords", authenticateToken, async (req, res) => {
    try {
      const keywords = await storage.getUserKeywords(req.userId!);
      res.json(keywords);
    } catch (error) {
      console.error("키워드 조회 오류:", error);
      res.status(500).json({ message: "키워드를 불러오는데 실패했습니다" });
    }
  });

  // Create new keyword
  app.post("/api/keywords", authenticateToken, async (req, res) => {
    try {
      const validatedData = insertKeywordSchema.parse(req.body);
      
      const newKeyword = await storage.createKeyword({
        ...validatedData,
        userId: req.userId!,
      });
      
      res.status(201).json(newKeyword);
    } catch (error) {
      console.error("키워드 생성 오류:", error);
      res.status(400).json({ message: "키워드 생성에 실패했습니다" });
    }
  });

  // Update keyword
  app.patch("/api/keywords/:id", authenticateToken, async (req, res) => {
    try {
      const keywordId = parseInt(req.params.id);
      const validatedData = insertKeywordSchema.partial().parse(req.body);
      
      const updatedKeyword = await storage.updateKeyword(keywordId, req.userId!, validatedData);
      
      if (!updatedKeyword) {
        return res.status(404).json({ message: "키워드를 찾을 수 없습니다" });
      }
      
      res.json(updatedKeyword);
    } catch (error) {
      console.error("키워드 수정 오류:", error);
      res.status(400).json({ message: "키워드 수정에 실패했습니다" });
    }
  });

  // Delete keyword
  app.delete("/api/keywords/:id", authenticateToken, async (req, res) => {
    try {
      const keywordId = parseInt(req.params.id);
      
      const deleted = await storage.deleteKeyword(keywordId, req.userId!);
      
      if (!deleted) {
        return res.status(404).json({ message: "키워드를 찾을 수 없습니다" });
      }
      
      res.json({ message: "키워드가 삭제되었습니다" });
    } catch (error) {
      console.error("키워드 삭제 오류:", error);
      res.status(500).json({ message: "키워드 삭제에 실패했습니다" });
    }
  });


  const httpServer = createServer(app);
  
  // 웹소켓 서버 설정
  setupWebSocket(httpServer);
  
  return httpServer;
}
