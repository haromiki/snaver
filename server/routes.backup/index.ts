//srv\xpro0\snaver\src\snaver\server\routes\index.ts
import express from "express";
import type { Express, Response, NextFunction } from "express";  // Express 타입 추가

export async function registerRoutes(app: Express) {
  // 예시 API
  app.get("/api/hello", (req, res) => {
    res.json({ message: "Hello from API" });
  });
  // 필요한 다른 라우트 등록 가능
  return app;
}
