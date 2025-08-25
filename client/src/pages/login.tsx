import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    usernameOrEmail: "",
  });
  
  // 아이디 중복체크 상태
  const [usernameCheck, setUsernameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'unavailable' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  
  const { login, register, isLoginPending, isRegisterPending } = useAuth();
  const { toast } = useToast();

  // 실시간 아이디 중복체크 (debounce)
  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameCheck({ status: 'idle', message: '' });
      return;
    }

    setUsernameCheck({ status: 'checking', message: '중복 확인 중...' });

    try {
      const response = await apiRequest("GET", `/auth/check-username/${username}`);
      const result = await response.json();
      
      setUsernameCheck({
        status: result.available ? 'available' : 'unavailable',
        message: result.message
      });
    } catch (error) {
      setUsernameCheck({ 
        status: 'error', 
        message: '중복확인에 실패했습니다. 다시 시도해주세요.' 
      });
    }
  }, []);

  // 아이디 입력 시 debounce로 중복체크
  useEffect(() => {
    if (!isRegister) return;
    
    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(formData.username);
    }, 500); // 500ms 지연

    return () => clearTimeout(timeoutId);
  }, [formData.username, isRegister, checkUsernameAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isRegister) {
        // 아이디 중복체크 확인
        if (usernameCheck.status !== 'available') {
          toast({
            title: "오류",
            description: "사용 가능한 아이디를 입력해주세요.",
            variant: "destructive",
          });
          return;
        }
        
        await register({
          username: formData.username,
          // email: formData.email, // 이메일 제거
          password: formData.password,
        });
        toast({
          title: "회원가입 성공",
          description: "환영합니다!",
        });
      } else {
        await login({
          usernameOrEmail: formData.usernameOrEmail,
          password: formData.password,
        });
        toast({
          title: "로그인 성공",
          description: "대시보드로 이동합니다.",
        });
      }
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <i className="fas fa-chart-line text-white text-lg sm:text-xl"></i>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">SNAVER</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-2">네이버 쇼핑 순위 추적 시스템</p>
        </div>

        {/* Login Form */}
        {!isRegister && (
          <Card data-testid="login-form">
            <CardHeader>
              <CardTitle>로그인</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="usernameOrEmail">아이디 또는 이메일</Label>
                  <Input
                    id="usernameOrEmail"
                    data-testid="input-username-email"
                    type="text"
                    value={formData.usernameOrEmail}
                    onChange={(e) => setFormData({ ...formData, usernameOrEmail: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    data-testid="input-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoginPending}
                  data-testid="button-login"
                >
                  {isLoginPending ? "로그인 중..." : "로그인"}
                </Button>
                
                {/* 네이버 로그인 주석처리 - 사용자 요청에 따라 비활성화
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">또는</span>
                  </div>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full bg-green-500 hover:bg-green-600 text-white border-green-500"
                  onClick={() => window.location.href = '/api/auth/naver'}
                  data-testid="button-naver-login"
                >
                  <span className="mr-2">N</span>
                  네이버로 로그인
                </Button>
                */}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Register Form */}
        <Card data-testid="register-form">
          <CardHeader>
            <CardTitle>{isRegister ? "회원가입" : "계정이 없으신가요?"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isRegister ? (
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="reg-username">아이디</Label>
                  <Input
                    id="reg-username"
                    data-testid="input-register-username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className={`${
                      usernameCheck.status === 'available' ? 'border-green-500' :
                      usernameCheck.status === 'unavailable' ? 'border-red-500' :
                      ''
                    }`}
                    required
                  />
                  {/* 중복체크 결과 표시 */}
                  {formData.username.length >= 3 && (
                    <p className={`text-xs mt-1 ${
                      usernameCheck.status === 'checking' ? 'text-gray-500' :
                      usernameCheck.status === 'available' ? 'text-green-600' :
                      usernameCheck.status === 'unavailable' ? 'text-red-600' :
                      'text-gray-500'
                    }`}>
                      {usernameCheck.status === 'checking' && '⚠️ '}
                      {usernameCheck.status === 'available' && '✅ '}
                      {usernameCheck.status === 'unavailable' && '❌ '}
                      {usernameCheck.message}
                    </p>
                  )}
                </div>
                {/* 이메일 필드 주석처리 - 사용자 요청에 따라 비활성화
                <div>
                  <Label htmlFor="reg-email">이메일</Label>
                  <Input
                    id="reg-email"
                    data-testid="input-register-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                */}
                <div>
                  <Label htmlFor="reg-password">비밀번호</Label>
                  <Input
                    id="reg-password"
                    data-testid="input-register-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    8자 이상, 대소문자, 숫자, 특수문자 포함
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button 
                    type="submit" 
                    className="flex-1" 
                    disabled={isRegisterPending || usernameCheck.status !== 'available'}
                    data-testid="button-register"
                  >
                    {isRegisterPending ? "등록 중..." : "회원가입"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsRegister(false)}
                    data-testid="button-cancel-register"
                  >
                    취소
                  </Button>
                </div>
              </form>
            ) : (
              <Button 
                onClick={() => setIsRegister(true)} 
                variant="outline" 
                className="w-full"
                data-testid="button-show-register"
              >
                회원가입하기
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
