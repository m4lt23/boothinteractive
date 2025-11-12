import { useAuth } from "@/hooks/useAuth";
import UserProfile from "@/components/UserProfile";
import Loading from "@/pages/Loading";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";

export default function Profile() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Unable to load user profile. Please try refreshing the page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your account settings and broadcasting preferences
            </p>
          </div>
          
          <UserProfile user={user} />
        </div>
      </div>
    </div>
  );
}