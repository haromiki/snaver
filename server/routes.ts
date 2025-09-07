// routes.ts
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertProductSchema,
  insertKeywordSchema,
  loginSchema,
  rankQuerySchema,
  type RankQuery,
  type RankResult,
} from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "./middleware/auth.ts";
import { fetchOrganicRank } from "./crawler/naverOrganic.js";
import { fetchOrganicRankPuppeteer } from "./crawler/naverOrganicPuppeteer.js";
import { fetchAdRank } from "./crawler/adCrawler.js";
import { getSearchStatus } from "./services/scheduler.ts";
import crypto from "crypto";
// WebSocket 제거됨 - SSE로 대체
import { handleSSEConnection } from "./sse";

// 세션 타입 확장
declare module "express-session" {
  interface SessionData {
    naverState?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// 👇️ DO NOT MODIFY BELOW: KST helpers (timezone-safe day/hour boundaries)
// KST 고정 오프셋(+09:00)을 문자열로 명시해 Date를 생성하면
// 서버 로컬 TZ와 무관하게 올바른 절대시간(UTC)이 만들어집니다.
const KST_TZ = "Asia/Seoul";
const two = (n: number) => String(n).padStart(2, "0");

/** 주어진 시각(now) 기준 KST 날짜 문자열(YYYY-MM-DD) */
function getKstYmd(now: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // e.g. "2025-09-07"
  return f.format(now);
}

/** "YYYY-MM-DDTHH:MM:SS+09:00" 형태의 KST 시각을 절대 시간 Date로 생성 */
function kstDate(ymd: string, hour = 0, min = 0, sec = 0): Date {
  return new Date(`${ymd}T${two(hour)}:${two(min)}:${two(sec)}+09:00`);
}
// 👆️ DO NOT MODIFY ABOVE

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
          message: "아이디는 3자 이상이어야 합니다",
        });
      }

      const existingUser = await storage.getUserByUsername(username);

      res.json({
        available: !existingUser,
        message: existingUser ? "이미 사용 중인 아이디입니다" : "사용 가능한 아이디입니다",
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
        token,
      });
    } catch (error: any) {
      console.error("회원가입 오류:", error);
      let message = "회원가입에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      } else if (error.message) {
        message = error.message;
      }

      res.status(400).json({ message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user =
        (await storage.getUserByUsername(validatedData.usernameOrEmail)) ||
        (await storage.getUserByEmail(validatedData.usernameOrEmail));

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
        token,
      });
    } catch (error: any) {
      console.error("로그인 오류:", error);
      let message = "로그인에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      } else if (error.message) {
        message = error.message;
      }

      res.status(400).json({ message });
    }
  });

  // 네이버 OAuth 로그인 시작
  app.get("/api/auth/naver", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/naver/callback`;
    const state = crypto.randomBytes(32).toString("hex");

    // 상태값을 세션에 저장 (실제로는 Redis나 DB에 저장하는 것이 좋음)
    req.session = req.session || {};
    req.session.naverState = state;

    const naverAuthUrl =
      `https://nid.naver.com/oauth2.0/authorize?` +
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
      const tokenResponse = await fetch("https://nid.naver.com/oauth2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId!,
          client_secret: clientSecret!,
          code: code as string,
          state: state as string,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        throw new Error("액세스 토큰을 받지 못했습니다");
      }

      // 사용자 정보 요청
      const userResponse = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userData = await userResponse.json();

      if (userData.resultcode !== "00") {
        throw new Error("사용자 정보를 가져오지 못했습니다");
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
          passwordHash: "", // 네이버 로그인 사용자는 비밀번호 없음
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
        email: user.email,
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
          message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: "새 비밀번호는 8자 이상이어야 합니다",
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
        message: "비밀번호가 성공적으로 변경되었습니다",
      });
    } catch (error: any) {
      console.error("비밀번호 변경 오류:", error);
      res.status(500).json({
        message: "비밀번호 변경에 실패했습니다",
      });
    }
  });

  // Products routes
  app.get("/api/products", authenticateToken, async (req, res) => {
    try {
      const { type, active } = req.query;
      const filters: any = {};

      if (type) filters.type = type;
      if (active !== undefined) filters.active = active === "true";

      const products = await storage.getProducts(req.userId!, filters);

      // 캐시 무효화 헤더 추가 (5초 폴링 시 실시간 데이터 보장)
      res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Authorization",
      });

      // Express의 자동 304 응답 방지를 위해 명시적으로 200 상태 설정
      res.status(200).json(products);
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
        message = error.issues.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
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
              notes: [`OpenAPI 오류: ${error.message}`],
            };
          }
        } else {
          console.log(`❌ OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용 (제품 ${product.id})`);
          rankResult = {
            productId: product.productNo,
            found: false,
            notes: ["OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용"],
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

      // 트랙 데이터 저장 - found 여부와 관계없이 항상 저장
      await storage.createTrack({
        productId: product.id,
        isAd: product.type === "ad",
        page: rankResult.found ? rankResult.page || null : null,
        rankOnPage: rankResult.found ? rankResult.rankInPage || null : null,
        globalRank: rankResult.found ? rankResult.globalRank || null : null,
        priceKrw: rankResult.found ? rankResult.price || null : null,
        mallName: rankResult.found ? rankResult.storeName || null : null,
        productLink: rankResult.found ? rankResult.storeLink || null : null,
      });

      res.json({
        success: true,
        message: "순위 업데이트가 완료되었습니다",
        result: rankResult,
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

  // 🔍 임시 디버깅 엔드포인트 - API 응답 구조 확인
  app.post("/api/debug/naver-api", async (req, res) => {
    try {
      const { keyword = "주차번호판" } = req.body;

      const clientId = process.env.NAVER_CLIENT_ID;
      const clientSecret = process.env.NAVER_CLIENT_SECRET;

      console.log("🔑 API 키 확인:", !!clientId, !!clientSecret);

      if (!clientId || !clientSecret) {
        return res
          .status(500)
          .json({ error: "API 인증정보 없음", clientId: !!clientId, clientSecret: !!clientSecret });
      }

      const { start = 1 } = req.body;
      const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(
        keyword
      )}&display=100&start=${start}&sort=sim`;

      console.log("🌐 요청 URL:", url);

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
        firstItemKeys: data.items?.[0] ? Object.keys(data.items[0]) : [],
      });

      const targetProductId = "5797852571";
      const matchingItems =
        data.items?.filter(
          (item: any) =>
            String(item.productId).includes(targetProductId) ||
            targetProductId.includes(String(item.productId))
        ) || [];

      return res.json({
        keyword,
        searchingFor: targetProductId,
        totalCount: data.total || 0,
        itemsLength: data.items?.length || 0,
        startPosition: start,
        matchingItems: matchingItems.length > 0 ? matchingItems : "미발견",
        firstItems:
          data.items
            ?.slice(0, 10)
            .map((item: any) => ({
              productId: item.productId,
              mallName: item.mallName,
              title: item.title,
              lprice: item.lprice,
              link: item.link,
              productType: item.productType,
              allKeys: Object.keys(item),
            })) || [],
        allProductIds: data.items?.map((item: any) => item.productId) || [],
        success: true,
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
          result = {
            productId: validatedData.productId,
            found: false,
            notes: [`OpenAPI 오류: ${error.message}`],
          };
        }
      } else {
        console.log(`❌ OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용`);
        result = {
          productId: validatedData.productId,
          found: false,
          notes: ["OpenAPI 인증정보 없음 - 실서버에서 Puppeteer 미사용"],
        };
      }

      res.json(result);
    } catch (error: any) {
      console.error("일반 순위 조회 오류:", error);
      let message = "일반 순위 조회에 실패했습니다";

      if (error.issues && Array.isArray(error.issues)) {
        message = error.issues.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      } else if (error.message) {
        message = error.message;
      }

      res.status(500).json({ message });
    }
  });

  // 1주일 순위 트렌드 데이터 API (KST 안전)
  app.get("/api/products/:id/weekly-ranks", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);

      const now = new Date();
      const ymd = getKstYmd(now);
      // 이번 주 월요일 00:00(KST)
      const kst = new Date(`${ymd}T00:00:00+09:00`);
      // kst.getDay()는 로컬 기준이므로, 주차 계산은 국제화 포맷으로 보정하지 않고
      // 요일 계산은 Date -> KST 문자열 재생성 대신 day별 루프로 처리
      // 월요일 기준 주 시작일 계산 (KST에서 계산)
      const dowF = new Intl.DateTimeFormat("en-US", { timeZone: KST_TZ, weekday: "short" });
      const weekday = dowF.format(now); // e.g., "Mon"
      // 요일 인덱스 맵 (Mon=1 ... Sun=0→7)
      const wmap: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const daysFromMonday = (wmap[weekday] ?? 7) - 1;

      const weekStartKST = new Date(kstDate(getKstYmd(now), 0, 0, 0).getTime() - daysFromMonday * 86400000);
      const nextWeekStartKST = new Date(weekStartKST.getTime() + 7 * 86400000);

      const weeklyRanks = await storage.getProductTracksInRange(
        productId,
        req.userId!,
        weekStartKST.toISOString(),
        nextWeekStartKST.toISOString()
      );

      const dailyRanks = [];
      for (let i = 0; i < 7; i++) {
        const dayStartKST = new Date(weekStartKST.getTime() + i * 86400000);
        const dayEndKST = new Date(dayStartKST.getTime() + 86400000);

        const dayName = ["월", "화", "수", "목", "금", "토", "일"][i];

        const dayTracks = weeklyRanks.filter((track: any) => {
          if (!track.checkedAt) return false;
          const t = new Date(track.checkedAt);
          return t >= dayStartKST && t < dayEndKST;
        });

        const latestTrack =
          dayTracks.length > 0
            ? dayTracks.sort(
                (a: any, b: any) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
              )[0]
            : null;

        const dayYmd = new Intl.DateTimeFormat("en-CA", {
          timeZone: KST_TZ,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(dayStartKST);

        dailyRanks.push({
          day: dayName,
          date: dayYmd,
          rank: latestTrack?.globalRank || null,
          hasData: !!latestTrack,
        });
      }

      res.json({
        productId,
        weekStart: new Intl.DateTimeFormat("en-CA", {
          timeZone: KST_TZ,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(weekStartKST),
        dailyRanks,
      });
    } catch (error) {
      console.error("1주일 순위 데이터 조회 오류:", error);
      res.status(500).json({ message: "1주일 순위 데이터를 가져오는데 실패했습니다" });
    }
  });

  // 1일 순위변동 그래프 API (24시간, KST 안전)
  app.get("/api/products/:id/daily-ranks", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);

      // 👇️ KST 기준 오늘 00:00 ~ 내일 00:00을 절대시간으로 정확히 산출
      const now = new Date();
      const ymdKST = getKstYmd(now); // "YYYY-MM-DD" (KST 기준 오늘)
      const todayStartKST = kstDate(ymdKST, 1, 0, 0);
      const tomorrowStartKST = new Date(todayStartKST.getTime() + 24 * 60 * 60 * 1000);

      // 오늘 하루치 데이터 조회 (UTC 저장이라도 절대시간 비교이므로 안전)
      const dailyTracks = await storage.getProductTracksInRange(
        productId,
        req.userId!,
        todayStartKST.toISOString(),
        tomorrowStartKST.toISOString()
      );

      // 24시간 1시간 단위로 데이터 정리 (KST 구간으로 자름)
      const hourlyRanks: Array<{
        hour: string;
        time: string;
        rank: number | null;
        hasData: boolean;
      }> = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourStartKST = kstDate(ymdKST, hour, 0, 0);
        const hourEndKST = new Date(hourStartKST.getTime() + 60 * 60 * 1000);

        const hourTracks = dailyTracks.filter((track: any) => {
          if (!track.checkedAt) return false;
          const t = new Date(track.checkedAt);
          return t >= hourStartKST && t < hourEndKST;
        });

        const latestTrack =
          hourTracks.length > 0
            ? hourTracks.sort(
                (a: any, b: any) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
              )[0]
            : null;

        hourlyRanks.push({
          hour: `${two(hour)}:00`,
          time: hourStartKST.toISOString(),
          rank: latestTrack?.globalRank || null,
          hasData: !!latestTrack,
        });
      }

      // 캐시 무효화(자정 전후 갱신 보장) + 인증별 변형
      res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Authorization",
        "X-Timezone": "Asia/Seoul",
      });

      res.json({
        productId,
        dayStart: ymdKST, // ← KST 기준 날짜 문자열을 직접 반환
        hourlyRanks,
      });
    } catch (error) {
      console.error("1일 순위변동 데이터 조회 오류:", error);
      res.status(500).json({ message: "1일 순위변동 데이터를 가져오는데 실패했습니다" });
    }
  });

  // 가격 히스토리 조회 API
  app.get("/api/products/:id/price-history", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { range = "1year" } = req.query;

      // 날짜 범위 계산
      const now = new Date();
      let fromDate: Date;

      switch (range) {
        case "1month":
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "3months":
          fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "6months":
          fromDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case "2years":
          fromDate = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
          break;
        default: // '1year'
          fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
      }

      // 가격 데이터가 있는 트랙들만 조회
      const tracks = await storage.getTracks(productId, fromDate, now);
      const tracksWithPrice = tracks.filter((track) => track.priceKrw && track.priceKrw > 0);

      if (tracksWithPrice.length === 0) {
        return res.json({
          data: [],
          stats: {
            current: 0,
            highest: 0,
            lowest: 0,
            average: 0,
          },
        });
      }

      // 주간별로 데이터 그룹화 (같은 주의 데이터는 평균 가격 사용)
      const weeklyData = new Map<string, { prices: number[]; date: string }>();

      tracksWithPrice.forEach((track) => {
        if (!track.checkedAt) return; // null 체크 추가
        const trackDate = new Date(track.checkedAt);
        // 월요일 시작 주의 시작일 계산 (단순화: 로컬 기준이 아닌 절대시간 기준 후 정렬로 보정)
        const dayOfWeek = trackDate.getUTCDay(); // 0=Sun
        const diff = trackDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(Date.UTC(trackDate.getUTCFullYear(), trackDate.getUTCMonth(), diff, 0, 0, 0));
        const weekKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(weekStart);

        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, {
            prices: [],
            date: weekKey,
          });
        }

        weeklyData.get(weekKey)!.prices.push(track.priceKrw!);
      });

      // 주간 평균 가격 계산
      const chartData = Array.from(weeklyData.entries())
        .map(([date, data]) => ({
          date: data.date,
          price: Math.round(data.prices.reduce((sum, price) => sum + price, 0) / data.prices.length),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 통계 계산
      const allPrices = tracksWithPrice.map((t) => t.priceKrw!);

      const sortedByTime = tracksWithPrice
        .filter((track) => track.checkedAt) // null 체크 추가
        .sort((a, b) => new Date(b.checkedAt!).getTime() - new Date(a.checkedAt!).getTime());

      const stats = {
        current: sortedByTime[0]?.priceKrw || 0,
        highest: Math.max(...allPrices),
        lowest: Math.min(...allPrices),
        average: Math.round(allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length),
      };

      res.json({
        data: chartData,
        stats,
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
        message = error.issues.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
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

  // SSE 연결 엔드포인트 (쿼리 파라미터 인증)
  app.get("/api/events", (req, res) => {
    handleSSEConnection(req, res);
  });

  const httpServer = createServer(app);

  // WebSocket 제거됨 - SSE로 대체

  return httpServer;
}
