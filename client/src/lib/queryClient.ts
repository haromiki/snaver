import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ----- 내부 함수 -----
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// 👇️ DO NOT MODIFY BELOW: Safe API wrapper for both dev and server
export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = data
    ? { "Content-Type": "application/json" }
    : {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!res.ok) {
      const errorText = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${errorText}`);
    }

    return (await res.json()) as T;
  } catch (e: any) {
    throw new Error(`API 요청 실패: ${e?.message || String(e)}`);
  }
}
// 👆️ DO NOT MODIFY ABOVE

// ----- react-query용 getQueryFn -----
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

    const res = await fetch(queryKey.join("/") as string, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// ----- queryClient 인스턴스 생성 -----
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
