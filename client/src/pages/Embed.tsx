import { Footer } from "@/components/Footer";
import { ProofreadPanel } from "@/components/ProofreadPanel";
import { getEmbedToken, useLocalAuth } from "@/hooks/useLocalAuth";

/**
 * iframe 嵌入模式：通过 ?token=<API Token> 免登录访问。
 * 精简界面，无导航栏。
 */
export default function Embed() {
  const { user, loading } = useLocalAuth();
  const token = getEmbedToken();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold mb-2">无法访问</h1>
          <p className="text-sm text-muted-foreground leading-6">
            {token
              ? "提供的 Token 无效或已被吊销，请联系管理员获取有效的 API Token。"
              : "嵌入模式需要在 URL 中携带 token 参数，例如 /embed?token=pk_xxxx"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-3xl mx-auto px-4 py-6 w-full">
        <ProofreadPanel compact />
      </div>
      <Footer />
    </div>
  );
}
