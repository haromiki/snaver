import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    usernameOrEmail: "",
  });
  
  const { login, register, isLoginPending, isRegisterPending } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isRegister) {
        await register({
          username: formData.username,
          email: formData.email,
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-chart-line text-white text-xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SNAVER</h1>
          <p className="text-gray-500 mt-2">네이버 쇼핑 순위 추적 시스템</p>
        </div>

        {/* Login Form */}
        {!isRegister && (
          <Card data-testid="login-form">
            <CardHeader>
              <CardTitle>로그인</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="reg-username">아이디</Label>
                  <Input
                    id="reg-username"
                    data-testid="input-register-username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
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
                    disabled={isRegisterPending}
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
