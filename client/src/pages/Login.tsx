import { Footer } from "@/components/Footer";
import { Turnstile } from "@/components/Turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageTitle } from "@/hooks/usePageTitle";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  usePageTitle("登录");
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const utils = trpc.useUtils();

  // 运行时获取 Turnstile 配置与备案信息（后端下发，无需重建镜像）
  const { data: publicSettings } = trpc.localAuth.publicSettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const turnstileEnabled = Boolean(publicSettings?.turnstile.enabled);
  const turnstileSiteKey = publicSettings?.turnstile.siteKey ?? "";
  const oidcEnabled = Boolean(publicSettings?.oidc.enabled);
  const oidcDisplayName = publicSettings?.oidc.displayName ?? "SSO";

  // 回调失败时 IdP 重定向回 /login?oidc_error=xxx，提示用户
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("oidc_error");
    if (err) {
      const msg: Record<string, string> = {
        invalid_state: "登录状态校验失败，请重试",
        token_exchange_failed: "SSO 令牌交换失败，请重试",
        userinfo_failed: "获取用户信息失败，请重试",
        no_sub: "SSO 返回的用户信息无效",
        user_create_failed: "用户创建失败，请联系管理员",
        oidc_not_configured: "SSO 未配置，请联系管理员",
        oidc_discovery_failed: "无法连接 SSO 服务，请稍后重试",
        callback_error: "SSO 登录失败，请重试",
        account_pending_approval: "账号待管理员审批，请稍后再试或联系管理员",
        idp_error: "SSO 服务拒绝了授权，请检查 IdP 端该应用的访问权限配置",
      };
      toast.error(msg[err] ?? `SSO 登录失败：${err}`);
      // 清理 URL 参数，避免刷新重复提示
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: async result => {
      // 直接写入 me 缓存，避免 invalidate 触发 refetch 造成 AppShell 未认证误判跳回登录页
      utils.localAuth.me.setData(undefined, {
        id: result.user.id,
        username: result.user.username,
        displayName: null,
        role: result.user.role,
        tokenAuth: false,
        mustChangePassword: result.user.mustChangePassword,
        isOidc: false,
      });
      if (result.user.mustChangePassword) {
        toast.info("首次登录，请先修改密码");
        navigate("/settings/password");
      } else {
        navigate("/workspace");
      }
      // 后台静默刷新一次，确保数据与服务端一致
      void utils.localAuth.me.invalidate();
    },
    onError: err => {
      toast.error(err.message || "登录失败");
      // 验证失败后重置 Turnstile，强制重新验证
      setTurnstileToken("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("请输入用户名和密码");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      toast.error("请先完成人机验证");
      return;
    }
    loginMutation.mutate({
      username: username.trim(),
      password,
      ...(turnstileToken ? { turnstileToken } : {}),
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm animate-pop">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="文语校对" className="w-16 h-16 rounded-2xl shadow-lg mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">文语校对</h1>
          <p className="text-sm text-muted-foreground mt-1.5">大模型驱动的智能文本校对系统</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-[13px]">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 rounded-xl"
            />
          </div>

          {turnstileEnabled && turnstileSiteKey && (
            <div className="flex justify-center">
              <Turnstile
                key={turnstileSiteKey}
                siteKey={turnstileSiteKey}
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
                onError={() => {
                  setTurnstileToken("");
                  toast.error("人机验证组件出错，请刷新重试");
                }}
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-11 rounded-xl pressable text-[15px] font-medium"
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
          </Button>
        </form>

        {oidcEnabled && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                <span className="bg-background px-2 text-muted-foreground">或</span>
              </div>
            </div>
            <a
              href="/api/oidc/login?redirect=/workspace"
              className="flex items-center justify-center w-full h-11 rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-[15px] font-medium pressable"
            >
              {oidcDisplayName}
            </a>
          </>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6 leading-5">
          首次部署时，管理员账号与随机密码打印在服务启动日志中
        </p>
      </div>

      <Footer />
    </div>
  );
}
