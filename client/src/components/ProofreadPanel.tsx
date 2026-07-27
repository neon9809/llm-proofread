import { InlineDiff, type RuleHitView } from "@/components/InlineDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { copyToClipboard } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface ParagraphView {
  index: number;
  original: string;
  corrected: string;
  llmReason: string;
  ruleHits: RuleHitView[];
  changed: boolean;
  llmError?: string;
  /** 用户决策：pending 待处理 / accepted / ignored */
  decision: "pending" | "accepted" | "ignored";
}

/**
 * 校对工作区核心面板（登录模式与 iframe 嵌入模式共用）。
 */
export function ProofreadPanel({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState("");
  const [useLlm, setUseLlm] = useState(true);
  const [useRules, setUseRules] = useState(true);
  const [useFixedExpressions, setUseFixedExpressions] = useState(false);
  const [llmConfigId, setLlmConfigId] = useState<string>("default");
  const [paragraphs, setParagraphs] = useState<ParagraphView[] | null>(null);
  const [llmConfigName, setLlmConfigName] = useState<string | undefined>();

  const { data: llmConfigs } = trpc.llmConfigs.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const runMutation = trpc.proofread.run.useMutation({
    onSuccess: result => {
      setParagraphs(
        result.paragraphs.map(p => ({
          ...p,
          ruleHits: p.ruleHits.map(h => ({
            type: h.type,
            word: h.word,
            replacement: h.replacement,
            positions: h.positions,
          })),
          decision: p.changed ? "pending" : "accepted",
        })),
      );
      setLlmConfigName(result.llmConfigName);
      const changed = result.paragraphs.filter(p => p.changed).length;
      toast.success(`校对完成：共 ${result.paragraphs.length} 段，${changed} 段有修改建议`);
    },
    onError: err => toast.error(err.message || "校对失败"),
  });

  const handleRun = () => {
    if (!text.trim()) {
      toast.error("请输入需要校对的文本");
      return;
    }
    if (!useLlm && !useRules) {
      toast.error("请至少启用一种审核引擎");
      return;
    }
    if (useFixedExpressions && !useLlm) {
      toast.error("固定表述需要配合大模型校对使用");
      return;
    }
    setParagraphs(null);
    runMutation.mutate({
      text,
      useLlm,
      useRules,
      useFixedExpressions,
      llmConfigId: llmConfigId !== "default" ? Number(llmConfigId) : undefined,
    });
  };

  const setDecision = (index: number, decision: "accepted" | "ignored") => {
    setParagraphs(prev =>
      prev ? prev.map(p => (p.index === index ? { ...p, decision } : p)) : prev,
    );
  };

  const pendingCount = useMemo(
    () => paragraphs?.filter(p => p.changed && p.decision === "pending").length ?? 0,
    [paragraphs],
  );

  const finalText = useMemo(() => {
    if (!paragraphs) return "";
    return paragraphs
      .map(p => (p.decision === "accepted" ? p.corrected : p.original))
      .join("\n");
  }, [paragraphs]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(finalText);
    if (ok) toast.success("已复制全文到剪贴板");
    else toast.error("复制失败，请手动选择文本复制");
  };

  const handleAcceptAll = () => {
    setParagraphs(prev =>
      prev ? prev.map(p => (p.changed && p.decision === "pending" ? { ...p, decision: "accepted" } : p)) : prev,
    );
  };

  const handleReset = () => {
    setParagraphs(null);
    setLlmConfigName(undefined);
  };

  // ---------- 输入阶段 ----------
  if (!paragraphs) {
    return (
      <div className="animate-rise space-y-4">
        {!compact && (
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">文本校对</h1>
            <p className="text-sm text-muted-foreground mt-1">
              粘贴或输入长文本，系统按段落切分后进行规则引擎与大模型双重审核
            </p>
          </div>
        )}

        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="在此粘贴或输入需要校对的文本，支持多段落（按换行分段）……"
          className="min-h-[320px] rounded-2xl text-[15px] leading-7 p-5 resize-y bg-card shadow-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={useLlm} onCheckedChange={setUseLlm} />
              <span className="text-[13px] font-medium">大模型校对</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={useRules} onCheckedChange={setUseRules} />
              <span className="text-[13px] font-medium">规则引擎</span>
            </label>
            {useLlm && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={useFixedExpressions} onCheckedChange={setUseFixedExpressions} />
                <span className="text-[13px] font-medium">固定表述</span>
              </label>
            )}
            {useLlm && llmConfigs && llmConfigs.length > 0 && (
              <Select value={llmConfigId} onValueChange={setLlmConfigId}>
                <SelectTrigger className="h-8 rounded-full text-[13px] w-auto min-w-[140px]">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认配置</SelectItem>
                  {llmConfigs.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}（{c.model}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{text.length} 字符</span>
            <Button
              onClick={handleRun}
              disabled={runMutation.isPending}
              className="rounded-full h-10 px-6 pressable font-medium"
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 校对中…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> 开始校对
                </>
              )}
            </Button>
          </div>
        </div>

        {runMutation.isPending && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center animate-pop">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              正在按段落调用审核引擎，长文本可能需要一些时间…
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---------- 结果阶段 ----------
  const changedParagraphs = paragraphs.filter(p => p.changed);

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!compact && <h1 className="text-[28px] font-semibold tracking-tight">校对结果</h1>}
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {paragraphs.length} 段 · {changedParagraphs.length} 段有建议
            {llmConfigName ? ` · 模型配置：${llmConfigName}` : ""}
            {pendingCount > 0 ? ` · ${pendingCount} 段待处理` : " · 全部处理完成"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset} className="rounded-full pressable h-9">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> 重新校对
          </Button>
          {pendingCount > 0 && (
            <Button variant="outline" onClick={handleAcceptAll} className="rounded-full pressable h-9">
              <Check className="w-3.5 h-3.5 mr-1.5" /> 全部接受
            </Button>
          )}
          <Button
            onClick={handleCopy}
            disabled={pendingCount > 0}
            className="rounded-full pressable h-9"
            title={pendingCount > 0 ? "请先处理所有建议" : "复制最终全文"}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" /> 复制全文
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {paragraphs.map((p, i) => (
          <div
            key={p.index}
            className={`rounded-2xl border p-5 bg-card transition-all duration-300 ${
              p.changed
                ? p.decision === "pending"
                  ? "border-primary/30 shadow-sm"
                  : "border-border opacity-80"
                : "border-border/60"
            }`}
            style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
                  第 {p.index + 1} 段
                </span>
                {p.ruleHits.some(h => h.type === "forbidden") && (
                  <Badge variant="destructive" className="text-[11px] rounded-full gap-1">
                    <AlertTriangle className="w-3 h-3" /> 违禁词
                  </Badge>
                )}
                {p.ruleHits.some(h => h.type === "replace") && (
                  <Badge variant="secondary" className="text-[11px] rounded-full">
                    不规范表述
                  </Badge>
                )}
                {p.llmError && (
                  <Badge variant="outline" className="text-[11px] rounded-full text-destructive border-destructive/40">
                    LLM 调用失败
                  </Badge>
                )}
                {!p.changed && (
                  <span className="text-[11px] text-muted-foreground">无修改</span>
                )}
              </div>
              {p.changed && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.decision === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setDecision(p.index, "accepted")}
                        className="rounded-full h-7 px-3 text-xs pressable"
                      >
                        <Check className="w-3 h-3 mr-1" /> 接受
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecision(p.index, "ignored")}
                        className="rounded-full h-7 px-3 text-xs pressable"
                      >
                        <X className="w-3 h-3 mr-1" /> 忽略
                      </Button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDecision(p.index, p.decision === "accepted" ? "ignored" : "accepted")}
                      className={`pressable text-[11px] font-medium rounded-full px-2.5 py-1 cursor-pointer ${
                        p.decision === "accepted"
                          ? "bg-[var(--diff-add-bg)] text-[var(--diff-add-fg)]"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {p.decision === "accepted" ? "✓ 已接受" : "已忽略"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {p.changed ? (
              <InlineDiff original={p.original} corrected={p.corrected} ruleHits={p.ruleHits} />
            ) : (
              <p className="leading-7 text-[15px] whitespace-pre-wrap break-words text-muted-foreground">
                {p.original}
              </p>
            )}

            {(p.llmReason && p.llmReason !== "无修改" && p.changed) || p.ruleHits.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
                {p.changed && p.llmReason && p.llmReason !== "无修改" && (
                  <p className="text-xs text-muted-foreground leading-5">
                    <span className="font-medium text-foreground/70">模型说明：</span>
                    {p.llmReason}
                  </p>
                )}
                {p.ruleHits.map((h, hi) => (
                  <p key={hi} className="text-xs text-muted-foreground leading-5">
                    {h.type === "forbidden" ? (
                      <>
                        <span className="font-medium text-destructive">违禁词：</span>
                        「{h.word}」出现 {h.positions.length} 次，请删除或改写
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-[var(--replace-fg)]">替换建议：</span>
                        「{h.word}」→「{h.replacement}」
                      </>
                    )}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pendingCount === 0 && (
        <div className="sticky bottom-4 flex justify-center animate-pop">
          <Button onClick={handleCopy} className="rounded-full h-11 px-8 pressable shadow-lg font-medium">
            <Copy className="w-4 h-4 mr-2" /> 复制最终全文
          </Button>
        </div>
      )}
    </div>
  );
}
