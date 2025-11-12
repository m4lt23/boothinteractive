import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Users, Volume2, Zap, DollarSign, Calendar } from "lucide-react";
import { Link } from "wouter";
import LiveEventCard from "@/components/LiveEventCard";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";

export default function Landing() {
  // Demo data - TODO: remove mock functionality
  const featuredEvents = [
    {
      id: "1",
      title: "Chiefs vs Bills - AFC Championship",
      homeTeam: { name: "Chiefs", city: "Kansas City" },
      awayTeam: { name: "Bills", city: "Buffalo" },
      status: "live" as const,
      caster: { firstName: "Mike", lastName: "Johnson" },
      listenerCount: 1247,
      startTime: new Date().toISOString(),
      tags: ["serious", "playoffs"]
    },
    {
      id: "2",
      title: "Lakers vs Warriors - NBA Finals",
      homeTeam: { name: "Warriors", city: "Golden State" },
      awayTeam: { name: "Lakers", city: "Los Angeles" },
      status: "scheduled" as const,
      caster: { firstName: "Sarah", lastName: "Wilson" },
      startTime: new Date(Date.now() + 3600000).toISOString(),
      tags: ["nba", "finals"]
    }
  ];

  const handleLogin = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    
    // Store the redirect URL in session storage for after login
    if (redirect) {
      sessionStorage.setItem('postLoginRedirect', redirect);
    }
    
    window.location.href = '/auth';
  };

  const handleJoinStream = (eventId: string) => {
    console.log('Joining stream:', eventId);
    // Would navigate to stream page in full app
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="flex justify-center mb-8">
              <img 
                src={boothLogo} 
                alt="BOOTH - Live Sports Commentary Platform" 
                className="h-40 lg:h-52 w-auto bg-transparent mix-blend-multiply dark:mix-blend-screen"
                data-testid="img-booth-logo"
              />
            </div>
            
            <div className="flex justify-center">
              <Badge variant="outline" className="gap-2 px-4 py-2">
                <Radio className="w-4 h-4 animate-pulse" />
                Commentary on Live Events
              </Badge>
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold tracking-tight">
              Your Voice, Your Words,
              <span className="text-primary block">Your Broadcast</span>
              <span className="block text-3xl lg:text-4xl mt-2">Find your favorite Casters, Listen for Free.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Connect with independent sports casters for audio commentary during live events. 
              Booth is invested in helping casters turn their passion into a career with live commentary on anything they want.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button 
                size="lg" 
                onClick={handleLogin}
                className="gap-2 px-8"
                data-testid="button-login"
              >
                <Volume2 className="w-5 h-5" />
                Get Started
              </Button>
              <Link to="/how-it-works">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="gap-2 px-8"
                  data-testid="button-learn-more"
                >
                  <Users className="w-5 h-5" />
                  How It Works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Live Events Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-6 mb-12">
          <h2 className="text-3xl font-bold">Live & Upcoming Events</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join thousands of sports fans experiencing events with expert commentary
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          {featuredEvents.map((event) => (
            <LiveEventCard 
              key={event.id} 
              event={event} 
              onJoinStream={handleJoinStream}
            />
          ))}
          
          {/* Call to Action Card */}
          <Card className="hover-elevate flex flex-col justify-center" data-testid="card-cta">
            <CardContent className="text-center space-y-4 p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Radio className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Become a Caster</h3>
                <p className="text-sm text-muted-foreground">
                  Turn your passion into a career. Commentary on anything you want, make a living doing what you love.
                </p>
              </div>
              <Button 
                onClick={handleLogin}
                variant="outline" 
                className="w-full"
                data-testid="button-become-caster"
              >
                Start Broadcasting
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* Full List of Events Button */}
        <div className="text-center mt-12">
          <Button 
            onClick={handleLogin}
            variant="outline" 
            size="lg"
            className="gap-2 px-8"
            data-testid="button-full-events-list"
          >
            <Calendar className="w-5 h-5" />
            View All Events
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-muted/30">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center space-y-6 mb-12">
            <h2 className="text-3xl font-bold">Why Choose Our Platform?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Experience sports commentary like never before with cutting-edge sync technology
            </p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Perfect Sync</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Auto-sync technology keeps audio perfectly aligned with your TV broadcast. 
                  Manual controls for fine-tuning to your setup.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Live Community</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Chat with fellow fans in real-time. Share reactions, celebrate plays, 
                  and connect with your sports community.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                  <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Support Casters</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Tip your favorite casters and support independent sports commentary. 
                  Help passionate broadcasters make a living from their expertise.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2024 BOOTH. Where casters make a living doing what they love.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}