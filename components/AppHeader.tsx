import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName } from "@/lib/utils";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";

export default function AppHeader() {
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-3 sm:h-16 sm:px-4">
        <Link to="/" className="inline-flex items-center" aria-label="Go to Live Events">
          <img
            src={boothLogo}
            alt="Booth"
            className="h-12 w-auto sm:h-14 bg-transparent mix-blend-multiply dark:mix-blend-screen select-none"
            draggable={false}
          />
        </Link>
        {/* no text next to the logo */}
        <div className="ml-auto">
          {/* Right side - user info and logout if authenticated */}
          {user && (
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/" data-testid="link-events">
                    Live Events
                  </Link>
                </Button>
                {user?.role === 'admin' && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/admin" data-testid="link-admin">
                      Admin
                    </Link>
                  </Button>
                )}
              </nav>
              
              <span className="text-sm text-muted-foreground" data-testid="text-welcome">
                Welcome back, {getUserDisplayName(user)}!
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                data-testid="button-logout"
              >
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}