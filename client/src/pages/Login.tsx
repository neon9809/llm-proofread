import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BookOpenText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();

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
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("请输入用户名和密码");
      return;
    }
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-pop">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <BookOpenText className="w-7 h-7 text-primary-foreground" />
          </div>
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
          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-11 rounded-xl pressable text-[15px] font-medium"
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6 leading-5">
          首次部署时，管理员账号与随机密码打印在服务启动日志中
        </p>
      </div>
    </div>
  );
}
