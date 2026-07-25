import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookOpenText, ChevronDown, FileText, KeyRound, LogOut, Settings2, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";

/**
 * 应用外壳：Apple 风格半透明顶栏 + 内容区。
 * 未登录自动跳转登录页。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, isAdmin, logout } = useLocalAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const navItems = [
    { path: "/workspace", label: "校对", icon: FileText },
    { path: "/settings", label: "配置", icon: Settings2 },
  ];
  const adminItems = [
    { path: "/admin/users", label: "用户管理", icon: Users },
    { path: "/admin/tokens", label: "API Token", icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* 半透明工具栏 */}
      <header className="glass-bar sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/workspace" className="flex items-center gap-2 pressable">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <BookOpenText className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold tracking-tight text-[15px]">文语校对</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(item => (
                <Link key={item.path} href={item.path}>
                  <span
                    className={`pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                      location.startsWith(item.path)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </span>
                </Link>
              ))}
              {isAdmin &&
                adminItems.map(item => (
                  <Link key={item.path} href={item.path}>
                    <span
                      className={`pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                        location.startsWith(item.path)
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <item.icon className="w-3.5 h-3.5" />
                      {item.label}
                    </span>
                  </Link>
                ))}
            </nav>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="pressable gap-1.5 rounded-full">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold">
                  {(user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}
                </div>
                <span className="text-[13px]">{user?.displayName || user?.username}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {user?.role === "admin" ? "管理员" : "用户"} · {user?.username}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/api-docs")}>
                <BookOpenText className="w-4 h-4 mr-2" /> API 文档
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings/password")}>
                <KeyRound className="w-4 h-4 mr-2" /> 修改密码
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" /> 退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* 移动端导航 */}
        <div className="sm:hidden border-t border-border/50 px-4 py-1.5 flex gap-1 overflow-x-auto">
          {[...navItems, ...(isAdmin ? adminItems : [])].map(item => (
            <Link key={item.path} href={item.path}>
              <span
                className={`pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                  location.startsWith(item.path)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
