import { useLocalAuth } from "@/hooks/useLocalAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";

/** 首页：根据登录状态重定向到工作区或登录页 */
export default function Home() {
  const { loading, isAuthenticated } = useLocalAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading) {
      navigate(isAuthenticated ? "/workspace" : "/login", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
