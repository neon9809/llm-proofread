import { trpc } from "@/lib/trpc";

/**
 * 本地账号认证状态 hook。
 * 支持两种模式：Cookie 会话（用户名/密码登录）与 URL token 免登录（iframe 嵌入）。
 */
export function useLocalAuth() {
  const utils = trpc.useUtils();
  const { data: user, isLoading, isFetching } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: prev => prev,
  });

  const logoutMutation = trpc.localAuth.logout.useMutation({
    onSuccess: () => {
      utils.localAuth.me.invalidate();
    },
  });

  return {
    user: user ?? null,
    loading: isLoading,
    fetching: isFetching,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === "admin",
    logout: () => logoutMutation.mutate(),
  };
}

/** 从 URL 读取嵌入 token（iframe 免登录模式） */
export function getEmbedToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}
