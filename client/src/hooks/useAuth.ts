import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { apiRequest } from "@/lib/api";

// DO NOT MODIFY BELOW: Server-only logic injected (navigate + VITE check)
import { useLocation } from "wouter";
// DO NOT MODIFY ABOVE

export function useAuth() {
  const queryClient = useQueryClient();

  // DO NOT MODIFY BELOW: Server-only logic injected (navigate + VITE check)
  const [, navigate] = useLocation();
  // DO NOT MODIFY ABOVE

  const { data: user, isLoading } = useQuery({
    queryKey: ["/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { usernameOrEmail: string; password: string }) => {
      const response = await apiRequest("POST", "/auth/login", credentials);
      return await response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      queryClient.setQueryData(["/auth/me"], data.user);

      // DO NOT MODIFY BELOW: Navigate only in server environment
      if ((import.meta as any).env.VITE_IS_SERVER_DEPLOY) {
        navigate("/dashboard");
      }
      // DO NOT MODIFY ABOVE
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: { username: string; email: string; password: string }) => {
      const response = await apiRequest("POST", "/auth/register", userData);
      return await response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      queryClient.setQueryData(["/auth/me"], data.user);

      // DO NOT MODIFY BELOW: Navigate only in server environment
      if ((import.meta as any).env.VITE_IS_SERVER_DEPLOY) {
        navigate("/dashboard");
      }
      // DO NOT MODIFY ABOVE
    },
  });

  const logout = () => {
    localStorage.removeItem("token");
    queryClient.setQueryData(["/auth/me"], null);
    queryClient.clear();
  };

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    isLoginPending: loginMutation.isPending,
    isRegisterPending: registerMutation.isPending,
  };
}
