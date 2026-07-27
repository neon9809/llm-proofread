import { AppShell } from "@/components/AppShell";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { History, KeyRound, Loader2, Plus, Trash2, UserX, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

function UserListTab() {
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.adminUsers.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "user" as "user" | "admin" });

  const invalidate = () => utils.adminUsers.list.invalidate();
  const createMutation = trpc.adminUsers.create.useMutation({
    onSuccess: r => {
      invalidate();
      setOpen(false);
      setForm({ username: "", password: "", displayName: "", role: "user" });
      if (r.initialPassword) {
        toast.success(`用户已创建，初始密码：${r.initialPassword}`, { duration: 20000 });
      } else {
        toast.success("用户已创建");
      }
    },
    onError: e => toast.error(e.message),
  });
  const statusMutation = trpc.adminUsers.setStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const resetMutation = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: r => toast.success(`密码已重置，新密码：${r.newPassword}`, { duration: 20000 }),
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.adminUsers.remove.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">共 {users?.length ?? 0} 个账号，每次登录自动记录 IP 地址</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full pressable">
              <Plus className="w-3.5 h-3.5 mr-1" /> 创建用户
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>创建用户</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>用户名</Label>
                <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="字母、数字、下划线" />
              </div>
              <div className="space-y-1.5">
                <Label>显示名称（可选）</Label>
                <Input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>初始密码（留空则自动生成）</Label>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="至少 8 位" />
              </div>
              <div className="space-y-1.5">
                <Label>角色</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as "user" | "admin" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">普通用户</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full pressable"
                disabled={createMutation.isPending}
                onClick={() => {
                  if (!form.username.trim()) {
                    toast.error("请输入用户名");
                    return;
                  }
                  if (form.password && form.password.length < 8) {
                    toast.error("密码至少 8 位");
                    return;
                  }
                  createMutation.mutate({
                    username: form.username.trim(),
                    password: form.password || undefined,
                    displayName: form.displayName.trim() || undefined,
                    role: form.role,
                  });
                }}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "创建"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最近登录</TableHead>
              <TableHead>最近登录 IP</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(u => (
              <TableRow key={u.id}>
                <TableCell>
                  <span className="font-medium">{u.username}</span>
                  {u.displayName && <span className="text-muted-foreground text-xs ml-1.5">{u.displayName}</span>}
                  {u.username.startsWith("oidc:") && (
                    <Badge variant="secondary" className="rounded-full text-[10px] ml-1.5">SSO</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="rounded-full text-[11px]">
                    {u.role === "admin" ? "管理员" : "用户"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "outline" : "destructive"} className="rounded-full text-[11px]">
                    {u.status === "active" ? "正常" : "已禁用"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmt(u.lastLoginAt)}</TableCell>
                <TableCell className="text-xs font-mono">{u.lastLoginIp || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs pressable"
                      title="重置密码"
                      onClick={() => {
                        if (confirm(`确认重置「${u.username}」的密码？`)) resetMutation.mutate({ id: u.id });
                      }}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs pressable"
                      title={u.status === "active" ? "禁用" : "启用"}
                      onClick={() =>
                        statusMutation.mutate({ id: u.id, status: u.status === "active" ? "disabled" : "active" })
                      }
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs text-destructive pressable"
                      title="删除"
                      onClick={() => {
                        if (confirm(`确认删除用户「${u.username}」？此操作不可恢复`)) removeMutation.mutate({ id: u.id });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LoginLogsTab() {
  const { data: logs, isLoading } = trpc.adminUsers.loginLogs.useQuery({ limit: 200 });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">最近 {logs?.length ?? 0} 条登录记录（含失败尝试）</p>
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>IP 地址</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>User Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.map(log => (
              <TableRow key={log.id}>
                <TableCell className="text-xs whitespace-nowrap">{fmt(log.createdAt)}</TableCell>
                <TableCell className="font-medium text-[13px]">{log.username}</TableCell>
                <TableCell className="text-xs font-mono">{log.ip}</TableCell>
                <TableCell>
                  <Badge variant={log.success === 1 ? "outline" : "destructive"} className="rounded-full text-[11px]">
                    {log.success === 1 ? "成功" : "失败"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                  {log.userAgent || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  usePageTitle("用户管理");
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto animate-rise">
        <h1 className="text-[28px] font-semibold tracking-tight mb-1">用户管理</h1>
        <p className="text-sm text-muted-foreground mb-6">管理系统账号，查看登录 IP 记录</p>
        <Tabs defaultValue="users">
          <TabsList className="rounded-full h-10 p-1 mb-4">
            <TabsTrigger value="users" className="rounded-full text-[13px] gap-1">
              <Users className="w-3.5 h-3.5" /> 账号列表
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-full text-[13px] gap-1">
              <History className="w-3.5 h-3.5" /> 登录日志
            </TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UserListTab />
          </TabsContent>
          <TabsContent value="logs">
            <LoginLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
