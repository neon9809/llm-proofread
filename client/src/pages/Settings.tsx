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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { trpc } from "@/lib/trpc";
import { Ban, KeyRound, ListChecks, Loader2, Pencil, Plus, Replace, Sparkles, Star, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

// ---------------- LLM 配置 ----------------

interface LlmConfigFormValue {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: string;
  concurrency: string;
}

const EMPTY_FORM: LlmConfigFormValue = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  prompt: "",
  temperature: "0.2",
  concurrency: "5",
};

/** LLM 配置表单：新增/编辑共用。编辑时 apiKey 留空表示不修改 */
function LlmConfigForm({
  initialValue,
  defaultPrompt,
  submitLabel,
  onSubmit,
  isPending,
}: {
  initialValue: LlmConfigFormValue;
  defaultPrompt?: string;
  submitLabel: string;
  onSubmit: (v: LlmConfigFormValue) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<LlmConfigFormValue>(initialValue);
  const isEdit = initialValue !== EMPTY_FORM;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>配置名称</Label>
        <Input
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="如：DeepSeek V3"
        />
      </div>
      <div className="space-y-1.5">
        <Label>API Base URL</Label>
        <Input
          value={form.baseUrl}
          onChange={e => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com/v1"
        />
        <p className="text-xs text-muted-foreground">
          OpenAI: https://api.openai.com/v1 · DeepSeek: https://api.deepseek.com/v1 · 通义:
          https://dashscope.aliyuncs.com/compatible-mode/v1
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>API Key</Label>
        <Input
          type="password"
          value={form.apiKey}
          onChange={e => setForm({ ...form, apiKey: e.target.value })}
          placeholder={isEdit ? "留空表示不修改" : "sk-..."}
        />
      </div>
      <div className="space-y-1.5">
        <Label>模型名称</Label>
        <Input
          value={form.model}
          onChange={e => setForm({ ...form, model: e.target.value })}
          placeholder="deepseek-chat / gpt-4o-mini / qwen-plus"
        />
      </div>
      <div className="space-y-1.5">
        <Label>校对 Prompt（留空使用内置默认）</Label>
        <Textarea
          value={form.prompt}
          onChange={e => setForm({ ...form, prompt: e.target.value })}
          placeholder={defaultPrompt?.slice(0, 80) + "……"}
          className="min-h-[100px] text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Temperature</Label>
        <Input
          value={form.temperature}
          onChange={e => setForm({ ...form, temperature: e.target.value })}
          placeholder="0.2"
        />
      </div>
      <div className="space-y-1.5">
        <Label>并发数</Label>
        <Input
          value={form.concurrency}
          onChange={e => setForm({ ...form, concurrency: e.target.value })}
          placeholder="5"
          type="number"
          min={1}
          max={100}
        />
        <p className="text-xs text-muted-foreground">
          段落级并发调用数，取决于服务商并发上限（1-100）
        </p>
      </div>
      <Button
        className="w-full pressable"
        disabled={isPending}
        onClick={() => {
          if (!form.name || !form.baseUrl || !form.model) {
            toast.error("请填写名称、Base URL 与模型");
            return;
          }
          if (!isEdit && !form.apiKey) {
            toast.error("请填写 API Key");
            return;
          }
          onSubmit(form);
        }}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  );
}

type LlmConfigItem = {
  id: number;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  model: string;
  prompt: string | null;
  temperature: string | null;
  concurrency: number;
  isDefault: boolean;
};

function LlmConfigTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: configs, isLoading } = trpc.llmConfigs.list.useQuery();
  const { data: defaultPrompt } = trpc.llmConfigs.defaultPrompt.useQuery();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LlmConfigItem | null>(null);

  const invalidate = () => utils.llmConfigs.list.invalidate();
  const createMutation = trpc.llmConfigs.create.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("LLM 配置已添加");
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.llmConfigs.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      toast.success("LLM 配置已更新");
    },
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.llmConfigs.remove.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const setDefaultMutation = trpc.llmConfigs.setDefault.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("已设为默认配置");
    },
    onError: e => toast.error(e.message),
  });
  const testMutation = trpc.llmConfigs.test.useMutation({
    onSuccess: r => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          配置 OpenAI 兼容接口（OpenAI / DeepSeek / 通义千问等），默认配置将用于校对
        </p>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full pressable">
                <Plus className="w-3.5 h-3.5 mr-1" /> 添加配置
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>添加 LLM 配置</DialogTitle>
              </DialogHeader>
              <LlmConfigForm
                initialValue={EMPTY_FORM}
                defaultPrompt={defaultPrompt ?? undefined}
                submitLabel="保存配置"
                isPending={createMutation.isPending}
                onSubmit={form => {
                  createMutation.mutate({
                    ...form,
                    apiKey: form.apiKey,
                    concurrency: Number(form.concurrency) || 5,
                    prompt: form.prompt || undefined,
                    isDefault: (configs?.length ?? 0) === 0,
                  });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* 编辑对话框 */}
      {isAdmin && editTarget && (
        <Dialog open onOpenChange={v => { if (!v) setEditTarget(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>编辑 LLM 配置</DialogTitle>
            </DialogHeader>
            <LlmConfigForm
              initialValue={{
                name: editTarget.name,
                baseUrl: editTarget.baseUrl,
                apiKey: "",
                model: editTarget.model,
                prompt: editTarget.prompt ?? "",
                temperature: editTarget.temperature ?? "0.2",
                concurrency: String(editTarget.concurrency ?? 5),
              }}
              defaultPrompt={defaultPrompt ?? undefined}
              submitLabel="保存修改"
              isPending={updateMutation.isPending}
              onSubmit={form => {
                updateMutation.mutate({
                  id: editTarget.id,
                  name: form.name,
                  baseUrl: form.baseUrl,
                  model: form.model,
                  prompt: form.prompt || undefined,
                  temperature: form.temperature,
                  concurrency: Number(form.concurrency) || 5,
                  ...(form.apiKey.trim() ? { apiKey: form.apiKey } : {}),
                });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {!configs || configs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            尚未配置任何大模型{isAdmin ? "，点击右上角「添加配置」开始" : "，请联系管理员配置"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map(c => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[15px]">{c.name}</span>
                  {c.isDefault && (
                    <Badge className="rounded-full text-[10px] gap-0.5">
                      <Star className="w-2.5 h-2.5" /> 默认
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {c.model} · {c.baseUrl} · Key: {c.apiKeyMasked} · 并发 {c.concurrency ?? 5}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full h-7 text-xs pressable"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate({ id: c.id })}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-3 h-3 mr-1" /> 测试
                      </>
                    )}
                  </Button>
                  {!c.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full h-7 text-xs pressable"
                      onClick={() => setDefaultMutation.mutate({ id: c.id })}
                    >
                      设为默认
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full h-7 text-xs pressable"
                    onClick={() => setEditTarget(c)}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> 编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full h-7 w-7 p-0 text-destructive pressable"
                    onClick={() => {
                      if (confirm(`确认删除配置「${c.name}」？`)) removeMutation.mutate({ id: c.id });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- 违禁词 ----------------

function ForbiddenWordsTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: words, isLoading } = trpc.forbiddenWords.list.useQuery();
  const [input, setInput] = useState("");

  const addBatchMutation = trpc.forbiddenWords.addBatch.useMutation({
    onSuccess: r => {
      utils.forbiddenWords.list.invalidate();
      setInput("");
      toast.success(`已添加 ${r.added} 个违禁词`);
    },
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.forbiddenWords.remove.useMutation({
    onSuccess: () => utils.forbiddenWords.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const handleAdd = () => {
    const items = input
      .split(/[\n,，、;；]+/)
      .map(w => w.trim())
      .filter(Boolean);
    if (items.length === 0) {
      toast.error("请输入违禁词");
      return;
    }
    addBatchMutation.mutate({ words: items });
  };

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        段落中命中违禁词时将直接标红提示，共 {words?.length ?? 0} 个
      </p>
      {isAdmin && (
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入违禁词，支持逗号/顿号/换行分隔批量添加"
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="rounded-xl"
          />
          <Button onClick={handleAdd} disabled={addBatchMutation.isPending} className="rounded-xl pressable shrink-0">
            <Plus className="w-4 h-4 mr-1" /> 添加
          </Button>
        </div>
      )}
      {!words || words.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Ban className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">暂无违禁词</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {words.map(w => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--forbidden-bg)] text-[var(--forbidden-fg)] px-3 py-1 text-[13px] font-medium animate-pop"
            >
              {w.word}
              {isAdmin && (
                <button
                  onClick={() => removeMutation.mutate({ id: w.id })}
                  className="hover:opacity-70 cursor-pointer"
                  aria-label={`删除 ${w.word}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- 替换规则 ----------------

function ReplaceRulesTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.replaceRules.list.useQuery();
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [note, setNote] = useState("");

  const addMutation = trpc.replaceRules.add.useMutation({
    onSuccess: () => {
      utils.replaceRules.list.invalidate();
      setPattern("");
      setReplacement("");
      setNote("");
      toast.success("规则已添加");
    },
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.replaceRules.remove.useMutation({
    onSuccess: () => utils.replaceRules.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        不规范表述替换规则（键值对），命中后在段落中高亮显示并提供替换建议，共 {rules?.length ?? 0} 条
      </p>
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <Input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="不规范表述，如：的的地" className="rounded-xl" />
          <Input value={replacement} onChange={e => setReplacement(e.target.value)} placeholder="替换为，如：得" className="rounded-xl" />
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="备注（可选）" className="rounded-xl" />
          <Button
            onClick={() => {
              if (!pattern.trim() || !replacement.trim()) {
                toast.error("请填写表述与替换内容");
                return;
              }
              addMutation.mutate({ pattern: pattern.trim(), replacement: replacement.trim(), note: note.trim() || undefined });
            }}
            disabled={addMutation.isPending}
            className="rounded-xl pressable"
          >
            <Plus className="w-4 h-4 mr-1" /> 添加
          </Button>
        </div>
      )}
      {!rules || rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Replace className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">暂无替换规则</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="rounded-xl border border-border bg-card px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[14px] min-w-0 flex-wrap">
                <span className="mark-replace">{r.pattern}</span>
                <span className="text-muted-foreground">→</span>
                <span className="diff-add">{r.replacement}</span>
                {r.note && <span className="text-xs text-muted-foreground">（{r.note}）</span>}
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full h-7 w-7 p-0 text-destructive pressable shrink-0"
                  onClick={() => removeMutation.mutate({ id: r.id })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- 固定表述 ----------------

function FixedExpressionsTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: content, isLoading } = trpc.settings.fixedExpressions.get.useQuery();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);

  // 首次加载后填充到编辑框
  if (!loaded && typeof content === "string") {
    setValue(content);
    setLoaded(true);
  }

  const updateMutation = trpc.settings.fixedExpressions.update.useMutation({
    onSuccess: () => {
      utils.settings.fixedExpressions.get.invalidate();
      toast.success("固定表述库已保存");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-12" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        维护固定表述参考库（领导姓名职务、单位机构名称、理论概念等）。校对时启用「固定表述」开关后，
        此内容会追加到 LLM 校对提示词末尾，作为标准表述参考。
      </p>
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="根据用户的需求，现已加载固定表述参考库……&#10;&#10;## 固定表述库&#10;### 一、领导姓名、职务、单位&#10;……"
        className="min-h-[400px] text-[13px] font-mono leading-6"
        disabled={!isAdmin}
      />
      {isAdmin && (
        <Button
          className="rounded-full pressable"
          disabled={updateMutation.isPending}
          onClick={() => updateMutation.mutate({ value })}
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存固定表述库"}
        </Button>
      )}
    </div>
  );
}

// ---------------- 修改密码 ----------------

function PasswordTab() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const changeMutation = trpc.localAuth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("密码已修改");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="max-w-sm space-y-4">
      <p className="text-sm text-muted-foreground">修改当前账号的登录密码，新密码至少 8 位</p>
      <div className="space-y-1.5">
        <Label>原密码</Label>
        <Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label>新密码</Label>
        <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label>确认新密码</Label>
        <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="rounded-xl" />
      </div>
      <Button
        className="w-full rounded-xl pressable"
        disabled={changeMutation.isPending}
        onClick={() => {
          if (newPassword.length < 8) {
            toast.error("新密码至少 8 位");
            return;
          }
          if (newPassword !== confirm) {
            toast.error("两次输入的新密码不一致");
            return;
          }
          changeMutation.mutate({ oldPassword, newPassword });
        }}
      >
        {changeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认修改"}
      </Button>
    </div>
  );
}

// ---------------- 主页面 ----------------

export default function Settings() {
  usePageTitle("配置");
  const { isAdmin, isOidc } = useLocalAuth();
  const params = useParams<{ tab?: string }>();
  const [, navigate] = useLocation();
  const tab = params.tab || "llm";

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto animate-rise">
        <h1 className="text-[28px] font-semibold tracking-tight mb-1">配置中心</h1>
        <p className="text-sm text-muted-foreground mb-6">
          管理大模型接口、违禁词与不规范表述替换规则
        </p>
        <Tabs value={tab} onValueChange={v => navigate(`/settings/${v}`)}>
          <TabsList className="rounded-full h-10 p-1 mb-4">
            <TabsTrigger value="llm" className="rounded-full text-[13px] gap-1">
              <Sparkles className="w-3.5 h-3.5" /> 大模型
            </TabsTrigger>
            <TabsTrigger value="forbidden" className="rounded-full text-[13px] gap-1">
              <Ban className="w-3.5 h-3.5" /> 违禁词
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-full text-[13px] gap-1">
              <Replace className="w-3.5 h-3.5" /> 替换规则
            </TabsTrigger>
            <TabsTrigger value="fixed" className="rounded-full text-[13px] gap-1">
              <ListChecks className="w-3.5 h-3.5" /> 固定表述
            </TabsTrigger>
            {!isOidc && (
              <TabsTrigger value="password" className="rounded-full text-[13px] gap-1">
                <KeyRound className="w-3.5 h-3.5" /> 密码
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="llm">
            <LlmConfigTab isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="forbidden">
            <ForbiddenWordsTab isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="rules">
            <ReplaceRulesTab isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="fixed">
            <FixedExpressionsTab isAdmin={isAdmin} />
          </TabsContent>
          {!isOidc && (
            <TabsContent value="password">
              <PasswordTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
