import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Workspace from "./pages/Workspace";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/AdminUsers";
import AdminTokens from "./pages/AdminTokens";
import Embed from "./pages/Embed";
import ApiDocs from "./pages/ApiDocs";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/workspace"} component={Workspace} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/settings/:tab"} component={Settings} />
      <Route path={"/admin/users"} component={AdminUsers} />
      <Route path={"/admin/tokens"} component={AdminTokens} />
      <Route path={"/embed"} component={Embed} />
      <Route path={"/api-docs"} component={ApiDocs} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
