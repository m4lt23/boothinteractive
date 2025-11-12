import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Radio, 
  Users, 
  Filter, 
  Heart, 
  Globe, 
  Volume2, 
  Smartphone,
  TrendingUp,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";
import AppHeader from "@/components/AppHeader";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <h1 className="text-4xl font-bold">How BOOTH Works</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Connect with independent sports casters for real-time audio commentary during live games. 
              Choose your perfect viewing experience.
            </p>
          </div>

          {/* For Listeners Section */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">For Listeners</h2>
              <p className="text-lg text-muted-foreground">
                Find your perfect caster and enhance your sports viewing experience
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {/* Filter Casters */}
              <Card className="hover-elevate">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <Filter className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Smart Filtering</h3>
                  <p className="text-muted-foreground">
                    Find casters by filtering for <strong>tone</strong> (serious, comedy, family-friendly), 
                    <strong> perspective</strong> (home fan, away fan, neutral), and <strong>mode</strong> 
                    (play-by-play, expert analysis, fantasy focus).
                  </p>
                  <div className="flex flex-wrap gap-1 justify-center">
                    <Badge variant="secondary">Serious</Badge>
                    <Badge variant="outline">Home Fan</Badge>
                    <Badge variant="outline">Play-by-Play</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Favorites */}
              <Card className="hover-elevate">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <Heart className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Instant Favorites</h3>
                  <p className="text-muted-foreground">
                    Set casters as <strong>"favorites"</strong> to start listening instantly. 
                    Never miss your preferred commentators during big games.
                  </p>
                </CardContent>
              </Card>

              {/* Background Audio */}
              <Card className="hover-elevate">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Background Audio</h3>
                  <p className="text-muted-foreground">
                    Audio will play in background when you leave the app, just don't close it. 
                    Perfect for multitasking during long games.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* For Casters Section */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">For Casters</h2>
              <p className="text-lg text-muted-foreground">
                Turn your passion for sports into a career with live commentary
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* Global Casting */}
              <Card className="hover-elevate">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <Globe className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Cast with Friends Worldwide</h3>
                  <p className="text-muted-foreground">
                    Collaborate with fellow casters across the world. Share commentary, 
                    bring different perspectives, and create unique listening experiences for fans.
                  </p>
                </CardContent>
              </Card>

              {/* Grow Following */}
              <Card className="hover-elevate">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Grow & Monetize</h3>
                  <p className="text-muted-foreground">
                    Build your following through consistent, quality commentary. 
                    Grow your audience and monetize your channel as your listener base expands.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* How It Works Steps */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">Getting Started</h2>
              <p className="text-lg text-muted-foreground">
                Join BOOTH in three simple steps
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  1
                </div>
                <h3 className="text-xl font-semibold">Create Account</h3>
                <p className="text-muted-foreground">
                  Sign up with your Replit account. Choose to be a listener, caster, or both.
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  2
                </div>
                <h3 className="text-xl font-semibold">Discover Games</h3>
                <p className="text-muted-foreground">
                  Browse live games and upcoming events. Filter casters by your preferences.
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  3
                </div>
                <h3 className="text-xl font-semibold">Start Listening</h3>
                <p className="text-muted-foreground">
                  Join live streams, follow your favorite casters, and enjoy personalized commentary.
                </p>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="bg-muted/50 rounded-lg p-8 space-y-6">
            <h2 className="text-2xl font-bold text-center">Why Choose BOOTH?</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Radio className="w-5 h-5 text-primary" />
                <span>Real-time audio commentary</span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <span>Connect with passionate fans</span>
              </div>
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-primary" />
                <span>Personalized caster matching</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <span>Global community of casters</span>
              </div>
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-primary" />
                <span>Follow favorite commentators</span>
              </div>
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-primary" />
                <span>Background audio support</span>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center space-y-6 py-8">
            <h2 className="text-3xl font-bold">Ready to Join?</h2>
            <p className="text-xl text-primary font-semibold">
              Grow your following, join the following.
            </p>
            <Link to="/">
              <Button size="lg" className="gap-2 px-8" data-testid="button-get-started-bottom">
                <Radio className="w-5 h-5" />
                Get Started Today
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}