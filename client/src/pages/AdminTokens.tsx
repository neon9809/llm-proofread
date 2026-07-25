import { AppShell } from "@/components/AppShell";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Ban, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminTokens() {
  const utils = trpc.useUtils();
  const { data: tokens, isLoading } = trpc.apiTokens.list.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const invalidate = () => utils.apiTokens.list.invalidate();
  const createMutation = trpc.apiTokens.create.useMutation({
    onSuccess: r => {
      invalidate();
      setCreatedToken(r.token);
      setName("");
    },
    onError: e => toast.error(e.message),
  });
  const revokeMutation = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.apiTokens.remove.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error("复制失败");
    }
  };

  const embedBase = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto animate-rise">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[28px] font-semibold tracking-tight">API Token</h1>
          <Dialog
            open={open}
            onOpenChange={v => {
              setOpen(v);
              if (!v) setCreatedToken(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full pressable">
                <Plus className="w-3.5 h-3.5 mr-1" /> 生成 Token
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{createdToken ? "Token 已生成" : "生成 API Token"}</DialogTitle>
              </DialogHeader>
              {createdToken ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    请立即复制并妥善保管，关闭后仍可在列表中查看
                  </p>
                  <div className="rounded-xl bg-secondary p-3 font-mono text-xs break-all">{createdToken}</div>
                  <div className="flex gap-2">
                    <Button className="flex-1 pressable" onClick={() => copyText(createdToken, "Token ")}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> 复制 Token
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 pressable"
                      onClick={() => copyText(`${embedBase}/embed?token=${createdToken}`, "嵌入链接")}
                    >
                      复制嵌入链接
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Token 名称</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：官网嵌入、内部系统调用" />
                  </div>
                  <Button
                    className="w-full pressable"
                    disabled={createMutation.isPending}
                    onClick={() => {
                      if (!name.trim()) {
                        toast.error("请输入 Token 名称");
                        return;
                      }
                      createMutation.mutate({ name: name.trim() });
                    }}
                  >
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "生成"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Token 用于开放 API 调用（Authorization: Bearer）与 iframe 嵌入免登录（/embed?token=...）
        </p>

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />
        ) : !tokens || tokens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <KeyRound className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">尚未生成任何 Token</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近使用</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-[13px]">{t.name}</TableCell>
                    <TableCell>
                      <button
                        className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer pressable"
                        onClick={() => copyText(t.token, "Token ")}
                        title="点击复制"
                      >
                        {t.token.slice(0, 10)}…{t.token.slice(-4)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "outline" : "destructive"} className="rounded-full text-[11px]">
                        {t.status === "active" ? "有效" : "已吊销"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(t.lastUsedAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(t.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.status === "active" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 rounded-full text-xs pressable"
                              title="复制嵌入链接"
                              onClick={() => copyText(`${embedBase}/embed?token=${t.token}`, "嵌入链接")}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 rounded-full text-xs pressable"
                              title="吊销"
                              onClick={() => {
                                if (confirm(`确认吊销 Token「${t.name}」？使用该 Token 的调用将立即失效`))
                                  revokeMutation.mutate({ id: t.id });
                              }}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-full text-xs text-destructive pressable"
                          title="删除"
                          onClick={() => {
                            if (confirm(`确认删除 Token「${t.name}」？`)) removeMutation.mutate({ id: t.id });
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
        )}
      </div>
    </AppShell>
  );
}
