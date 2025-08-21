import { useLocation, Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

// 👇️ DO NOT MODIFY BELOW: Server-specific routing fix (snaver base)
const basePath = window.location.hostname.includes("replit.dev") ? "/" : "/snaver";
// 👆️ DO NOT MODIFY ABOVE

function Router() {
  // 👇️ DO NOT MODIFY BELOW: Server-specific routing fix (snaver base)
  useLocation({ base: basePath });
  // 👆️ DO NOT MODIFY ABOVE

  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">로딩 중...</div>
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
      <Route path="/">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>

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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
