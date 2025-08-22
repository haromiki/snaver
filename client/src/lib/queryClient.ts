import { QueryClient, QueryFunction } from "@tanstack/react-query";

// 👇️ DO NOT MODIFY BELOW: VITE_API_URL is required for Replit + server routing
const BASE_API_URL = import.meta.env.VITE_API_URL || "/api";
// 👆️ DO NOT MODIFY ABOVE

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// 중복된 apiRequest 함수 제거 - api.ts에서 import하여 사용

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // ✅ BASE_API_URL을 사용하여 올바른 API 엔드포인트 호출
    const url = `${BASE_API_URL}${queryKey.join("/")}`;
    const res = await fetch(url, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
