import { Router, useLocation, Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

// 👇️ DO NOT MODIFY BELOW: Server-specific routing fix (snaver base)
const basePath = window.location.hostname.includes("replit.dev")
  ? "/"
  : "/snaver";
// 👆️ DO NOT MODIFY ABOVE

function RouterWithRoutes() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  console.log('[DEBUG] RouterWithRoutes - user:', user, 'isLoading:', isLoading, 'location:', location);

  // 네이버 OAuth 콜백 처리
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const loginSuccess = urlParams.get('loginSuccess');
    const loginError = urlParams.get('loginError');

    if (token && loginSuccess) {
      // 토큰을 localStorage에 저장
      localStorage.setItem('token', token);
      
      // URL 파라미터 제거
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // 성공 메시지
      toast({
        title: "네이버 로그인 성공",
        description: "환영합니다!",
      });
      
      // 페이지 새로고침 (useAuth가 토큰을 감지하도록)
      window.location.reload();
    } else if (loginError) {
      // URL 파라미터 제거
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // 에러 메시지
      toast({
        title: "네이버 로그인 실패",
        description: decodeURIComponent(loginError),
        variant: "destructive",
      });
    }
  }, [toast]);

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'white', 
        color: 'black', 
        fontSize: '18px', 
        fontFamily: 'Arial, sans-serif',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#1976d2', fontSize: '32px', fontWeight: 'bold', marginBottom: '10px' }}>🌐 SNAVER</div>
          <div style={{ color: '#666', fontSize: '18px', marginBottom: '20px' }}>인증 확인 중...</div>
          <div style={{ color: '#999', fontSize: '14px' }}>로딩: {isLoading ? 'true' : 'false'} | 사용자: {user ? '로그인됨' : '미로그인'}</div>
        </div>
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
        {user ? (
          <div style={{ 
            padding: '20px', 
            background: 'white', 
            minHeight: '100vh',
            color: 'black',
            fontSize: '16px'
          }}>
            <h1 style={{ color: '#1976d2', fontSize: '28px', marginBottom: '20px' }}>
              🌐 SNAVER - 순위 추적 시스템
            </h1>
            <p>사용자: {(user as any)?.username} ({(user as any)?.email})</p>
            <p>현재 시각: {new Date().toLocaleString('ko-KR')}</p>
            <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
              <h3>테스트 성공!</h3>
              <p>React 앱이 정상적으로 렌더링되고 있습니다.</p>
              <button 
                onClick={() => window.location.reload()}
                style={{ 
                  padding: '10px 20px', 
                  background: '#1976d2', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                새로고침
              </button>
            </div>
          </div>
        ) : <Redirect to="/login" />}
      </Route>

      {/* 루트: 로그인 상태에 따라 분기 */}
      <Route path="/">{user ? (
        <div style={{ 
          padding: '20px', 
          background: 'white', 
          minHeight: '100vh',
          color: 'black',
          fontSize: '16px'
        }}>
          <h1 style={{ color: '#1976d2', fontSize: '28px', marginBottom: '20px' }}>
            🌐 SNAVER - 순위 추적 시스템
          </h1>
          <p>사용자: {(user as any)?.username} ({(user as any)?.email})</p>
          <p>현재 시각: {new Date().toLocaleString('ko-KR')}</p>
          <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3>테스트 성공!</h3>
            <p>React 앱이 정상적으로 렌더링되고 있습니다.</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ 
                padding: '10px 20px', 
                background: '#1976d2', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      ) : <Redirect to="/login" />}</Route>

      {/* 없는 경로 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="snaver-ui-theme">
        <TooltipProvider>
          <div className="min-h-screen bg-background dark:bg-gray-900">
            <Toaster />
            {/* ✅ basePath를 Router에 직접 적용해야 경로가 올바르게 인식됩니다 */}
            <Router base={basePath}>
              <RouterWithRoutes />
            </Router>
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
