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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: 'black', fontSize: '18px', fontFamily: 'Arial, sans-serif' }}>
        🌐 SNAVER 로딩 중...
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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* ✅ basePath를 Router에 직접 적용해야 경로가 올바르게 인식됩니다 */}
        <Router base={basePath}>
          <RouterWithRoutes />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
