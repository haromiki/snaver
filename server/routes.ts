import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertProductSchema, loginSchema } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "./middleware/auth.ts";
import { crawlProduct } from "./crawler/shoppingCrawler.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/_health", (req, res) => {
    res.json({ ok: true, service: "snaver-api" });
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username) ||
                          await storage.getUserByEmail(validatedData.email);
      
      if (existingUser) {
        return res.status(400).json({ message: "이미 존재하는 사용자입니다" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(validatedData.password, 12);
      
      // Create user (exclude password from the data sent to storage)
      const { password, ...userDataForStorage } = validatedData;
      const user = await storage.createUser({
        ...userDataForStorage,
        passwordHash,
      });

      // Generate token
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
        // Zod validation error
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
      
      // Find user by username or email
      const user = await storage.getUserByUsername(validatedData.usernameOrEmail) ||
                   await storage.getUserByEmail(validatedData.usernameOrEmail);
      
      if (!user) {
        return res.status(401).json({ message: "잘못된 로그인 정보입니다" });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(validatedData.password, user.passwordHash);
      
      if (!isPasswordValid) {
        return res.status(401).json({ message: "잘못된 로그인 정보입니다" });
      }

      // Generate token
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
        // Zod validation error
        message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      } else if (error.message) {
        message = error.message;
      }
      
      res.status(400).json({ message });
    }
  });

  // Get current user
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

  // Product routes (all require authentication)
  app.get("/api/products", authenticateToken, async (req, res) => {
    try {
      const { type, active } = req.query;
      const filters: any = {};
      
      if (type) filters.type = type as string;
      if (active !== undefined) filters.active = active === "true";
      
      const products = await storage.getProducts(req.userId!, filters);
      
      // Get latest tracks for each product
      const productsWithTracks = await Promise.all(
        products.map(async (product) => {
          const latestTrack = await storage.getLatestTrack(product.id);
          return { ...product, latestTrack };
        })
      );
      
      res.json(productsWithTracks);
    } catch (error) {
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
      res.status(400).json({ message: error.message || "제품 추가에 실패했습니다" });
    }
  });

  app.patch("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const updates = req.body;
      
      const product = await storage.updateProduct(productId, req.userId!, updates);
      
      if (!product) {
        return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      }
      
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "제품 수정에 실패했습니다" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      const success = await storage.deleteProduct(productId, req.userId!);
      
      if (!success) {
        return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      }
      
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "제품 삭제에 실패했습니다" });
    }
  });

  app.post("/api/products/sort", authenticateToken, async (req, res) => {
    try {
      const { productIds } = req.body;
      
      await storage.updateProductSortOrder(req.userId!, productIds);
      
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "정렬 순서 저장에 실패했습니다" });
    }
  });

  app.post("/api/products/:id/refresh", authenticateToken, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      const product = await storage.getProduct(productId, req.userId!);
      if (!product) {
        return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      }
      
      // Run crawl
      const result = await crawlProduct(product);
      
      // Save track
      await storage.createTrack({
        productId: product.id,
        isAd: result.notFound ? false : result.is_ad,
        page: result.notFound ? null : result.page,
        rankOnPage: result.notFound ? null : result.rank_on_page,
        globalRank: result.notFound ? null : result.global_rank,
        priceKrw: result.notFound ? null : result.price_krw,
        mallName: result.notFound ? null : result.mall_name,
        productLink: result.notFound ? null : result.product_link,
      });
      
      res.json({ ok: true, result });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "수동 검색에 실패했습니다" });
    }
  });

  // Track routes
  app.get("/api/tracks", authenticateToken, async (req, res) => {
    try {
      const { product_id, from, to } = req.query;
      
      if (!product_id) {
        return res.status(400).json({ message: "product_id가 필요합니다" });
      }
      
      const productId = parseInt(product_id as string);
      
      // Verify user owns this product
      const product = await storage.getProduct(productId, req.userId!);
      if (!product) {
        return res.status(404).json({ message: "제품을 찾을 수 없습니다" });
      }
      
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;
      
      const tracks = await storage.getTracks(productId, fromDate, toDate);
      
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ message: "추적 데이터를 가져오는데 실패했습니다" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
