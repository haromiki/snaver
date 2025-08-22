// routes.ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertProductSchema, loginSchema, rankQuerySchema, type RankQuery, type RankResult } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "./middleware/auth.ts";
import { fetchOrganicRank } from "./crawler/naverOrganic.js";
import { fetchAdRank } from "./crawler/adCrawler.js";

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
        // 일반(오가닉) 순위 조회
        const clientId = process.env.NAVER_OPENAPI_CLIENT_ID;
        const clientSecret = process.env.NAVER_OPENAPI_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          return res.status(500).json({ 
            message: "Naver OpenAPI 인증정보가 설정되지 않았습니다" 
          });
        }

        rankResult = await fetchOrganicRank({
          productId: product.productNo,
          keyword: product.keyword,
          clientId,
          clientSecret,
        });
      } else {
        // 광고 순위 조회
        rankResult = await fetchAdRank({
          productId: product.productNo,
          keyword: product.keyword,
          maxPages: 10,
        });
      }

      // 트랙 데이터 저장
      if (rankResult.found) {
        await storage.createTrack({
          productId: product.id,
          isAd: product.type === "ad",
          page: rankResult.page || null,
          rankOnPage: rankResult.rankInPage || null,
          globalRank: rankResult.globalRank || null,
          priceKrw: rankResult.price || null,
          mallName: rankResult.storeName || null,
          productLink: rankResult.storeLink || null,
        });
      }

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
      const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=50&start=${start}`;
      
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
      
      // 응답 구조와 첫 10개 아이템 반환
      return res.json({
        keyword,
        totalCount: data.total || 0,
        itemsLength: data.items?.length || 0,
        firstItems: data.items?.slice(0, 10).map((item: any) => ({
          productId: item.productId,
          mallName: item.mallName,
          title: item.title,
          lprice: item.lprice,
          allKeys: Object.keys(item)
        })) || [],
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
      
      const clientId = process.env.NAVER_OPENAPI_CLIENT_ID;
      const clientSecret = process.env.NAVER_OPENAPI_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.status(500).json({ 
          message: "Naver OpenAPI 인증정보가 설정되지 않았습니다" 
        });
      }

      const result = await fetchOrganicRank({
        productId: validatedData.productId,
        keyword: validatedData.keyword,
        clientId,
        clientSecret,
      });

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

  // 광고 순위 조회 - Puppeteer 사용
  app.post("/api/rank/ad", authenticateToken, async (req, res) => {
    try {
      const validatedData = rankQuerySchema.parse(req.body);

      const result = await fetchAdRank({
        productId: validatedData.productId,
        keyword: validatedData.keyword,
        maxPages: validatedData.maxPages || 10,
      });

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

  const httpServer = createServer(app);
  return httpServer;
}
