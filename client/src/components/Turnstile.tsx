import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile 人机验证组件。
 * 显式渲染模式：动态加载 CF 脚本后调用 window.turnstile.render。
 *
 * @param siteKey  Turnstile 站点密钥
 * @param onToken  验证通过时回调，返回 token
 * @param onExpire token 过期回调，需重新验证
 * @param onError  渲染/校验出错回调
 */
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile script load error")));
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script load error"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export interface TurnstileProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

export function Turnstile({ siteKey, onToken, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // 防止 React StrictMode 双挂载重复渲染
        if (widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": onExpire,
          "error-callback": onError,
          theme: "auto",
          size: "normal",
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
    // siteKey 变化时重新渲染；回调用 ref 避免重渲染导致 widget 重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (loadError) {
    return (
      <div className="text-xs text-destructive rounded-xl border border-destructive/30 px-3 py-2">
        人机验证组件加载失败，请检查网络后刷新
      </div>
    );
  }

  return <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />;
}
