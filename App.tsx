import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Home from "@/pages/Home";
import Casters from "@/pages/Casters";
import EventCasters from "@/pages/EventCasters";
import Broadcaster from "@/pages/Broadcaster";
import HowItWorks from "@/pages/HowItWorks";
import NotFound from "@/pages/not-found";
import Profile from "@/pages/Profile";
import AdminDashboard from "@/pages/AdminDashboard";
import Event from "@/pages/Event";
import ListenerRoom from "@/pages/ListenerRoom";
import CohostJoinPage from "@/pages/CohostJoinPage";
import TermsPage from "@/pages/Terms";

function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Public routes - always available */}
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/terms" component={TermsPage} />
      
      {/* Auth route - AuthPage handles authenticated user redirects internally */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Landing page route - show landing if not authenticated, home if authenticated */}
      <Route path="/">
        {isAuthenticated ? (
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        ) : (
          <Landing />
        )}
      </Route>
      
      {/* Protected routes - always registered but wrapped with ProtectedRoute */}
      <Route path="/casters">
        <ProtectedRoute>
          <Casters />
        </ProtectedRoute>
      </Route>
      
      <Route path="/event/:eventId">
        <ProtectedRoute>
          <Event />
        </ProtectedRoute>
      </Route>
      
      <Route path="/event/:eventId/casters">
        <ProtectedRoute>
          <EventCasters />
        </ProtectedRoute>
      </Route>
      
      <Route path="/event/:eventId/broadcast">
        <ProtectedRoute>
          <Broadcaster />
        </ProtectedRoute>
      </Route>

      <Route path="/room/:sessionId">
        <ProtectedRoute>
          <ListenerRoom />
        </ProtectedRoute>
      </Route>
      
      <Route path="/cohost/j/:code">
        <ProtectedRoute>
          <CohostJoinPage />
        </ProtectedRoute>
      </Route>
      
      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin">
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Fallback - 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
