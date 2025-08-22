import { Router, useLocation, Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

// 👇️ DO NOT MODIFY BELOW: Server-specific routing fix (snaver base)
const basePath = window.location.hostname.includes("replit.dev")
  ? "/"
  : "/snaver";
// 👆️ DO NOT MODIFY ABOVE

function RouterWithRoutes() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg text-black">로딩 중...</div>
      </div>
    );
  }

  return (
    <Switch>
      {/* /login: 로그인 안 했을 때만 진입 허용 */}
      <Route path="/login">
        {!user ? <Login /> : <Redirect to="/dashboard" />}
      </Route>

      {/* /dashboard: 로그인 했을 때만 접근 가능 */}
      <Route path="/dashboard">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>

      {/* 루트: 로그인 상태에 따라 분기 */}
      <Route path="/">{user ? <Dashboard /> : <Redirect to="/login" />}</Route>

      {/* 없는 경로 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  console.log("🔥 App component rendering");
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* ✅ basePath를 Router에 직접 적용해야 경로가 올바르게 인식됩니다 */}
        <Router base={basePath}>
          <div style={{position: 'fixed', top: 0, left: 0, background: 'red', color: 'white', padding: '10px', zIndex: 9999}}>
            SNAVER 앱 테스트 - 이 메시지가 보이면 React가 작동 중입니다
          </div>
          <RouterWithRoutes />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
