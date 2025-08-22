// routes.ts
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
      });

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

  const httpServer = createServer(app);
  return httpServer;
}
