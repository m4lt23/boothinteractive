import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Lock, Eye, EyeOff, Radio, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { useEffect } from "react";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  screenname: z.string()
    .min(3, "Screen name must be at least 3 characters")
    .max(32, "Screen name cannot exceed 32 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Screen name can only contain letters, numbers, underscores, and hyphens"),
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  agreedToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the Terms and Conditions to create an account"
  }),
});

type LoginForm = z.infer<typeof loginSchema>;
type SignupForm = z.infer<typeof signupSchema>;

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const { isAuthenticated, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      const redirect = sessionStorage.getItem('postLoginRedirect');
      if (redirect) {
        sessionStorage.removeItem('postLoginRedirect');
        setLocation(redirect);
      } else {
        setLocation('/');
      }
    }
  }, [isAuthenticated, setLocation]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      screenname: "",
      password: "",
      agreedToTerms: false,
    },
  });

  const onLogin = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const onSignup = (data: SignupForm) => {
    registerMutation.mutate(data);
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Column - Hero/Privacy Section */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-background to-background p-8 flex-col justify-center">
        <div className="max-w-md mx-auto space-y-8">
          <div className="flex justify-center">
            <img 
              src={boothLogo} 
              alt="BOOTH - Live Sports Commentary Platform" 
              className="h-32 w-auto bg-transparent mix-blend-multiply dark:mix-blend-screen"
              data-testid="img-booth-logo"
            />
          </div>
          
          <div className="text-center space-y-4">
            <Badge variant="outline" className="gap-2 px-4 py-2">
              <Radio className="w-4 h-4 animate-pulse" />
              Live Commentary Platform
            </Badge>
            
            <h1 className="text-3xl font-bold tracking-tight">
              Your Privacy,
              <span className="text-primary block">Your Identity.</span>
            </h1>
            
            <p className="text-muted-foreground leading-relaxed">
              Choose how you appear in the Booth.
            </p>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Private by Default</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a unique screen name that others see in live chat. Your username and real name 
                  stay private while you enjoy full access to the community.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Safe Live Chat</h3>
                <p className="text-sm text-muted-foreground">
                  Engage with confidence knowing your personal information stays protected 
                  during live events and commentary sessions.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Community Focus</h3>
                <p className="text-sm text-muted-foreground">
                  Build your reputation based on your commentary and insights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Column - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Logo */}
          <div className="flex justify-center lg:hidden">
            <img 
              src={boothLogo} 
              alt="BOOTH - Live Sports Commentary Platform" 
              className="h-24 w-auto bg-transparent mix-blend-multiply dark:mix-blend-screen"
              data-testid="img-booth-logo-mobile"
            />
          </div>
          
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">
                {isLogin ? "Welcome back" : "Join BOOTH"}
              </CardTitle>
              <p className="text-center text-muted-foreground">
                {isLogin 
                  ? "Sign in to your account to continue" 
                  : "Create your account and choose your screen name"
                }
              </p>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {isLogin ? (
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Enter your email"
                              data-testid="input-email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                data-testid="input-password"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                                data-testid="button-toggle-password"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading}
                      data-testid="button-login"
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                </Form>
              ) : (
                <Form {...signupForm}>
                  <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                    {/* Email and Screen Name fields use register() instead of Controller to avoid input blocking issue */}
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="john@example.com"
                          data-testid="input-email"
                          autoComplete="email"
                          {...signupForm.register('email')}
                        />
                      </FormControl>
                      {signupForm.formState.errors.email && (
                        <p className="text-sm text-destructive mt-2">
                          {signupForm.formState.errors.email.message as string}
                        </p>
                      )}
                    </FormItem>
                    
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Screen Name
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="w-3 h-3 mr-1" />
                          Privacy Protected
                        </Badge>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="SportsGuru123"
                          data-testid="input-screenname"
                          {...signupForm.register('screenname')}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        This is how you'll appear in live chat and to other users
                      </p>
                      {signupForm.formState.errors.screenname && (
                        <p className="text-sm text-destructive mt-2">
                          {signupForm.formState.errors.screenname.message as string}
                        </p>
                      )}
                    </FormItem>
                    
                    <FormField
                      control={signupForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a strong password"
                                data-testid="input-password"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                                data-testid="button-toggle-password"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Must include uppercase, lowercase, number, and special character
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={signupForm.control}
                      name="agreedToTerms"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-terms"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-normal">
                              I have read, understand, and agree to the{" "}
                              <Link href="/terms">
                                <a className="text-primary hover:underline font-medium" target="_blank" data-testid="link-terms">
                                  Booth Terms and Conditions
                                </a>
                              </Link>
                            </FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading}
                      data-testid="button-signup"
                    >
                      {isLoading ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </Form>
              )}
              
              <Separator />
              
              <div className="text-center">
                <span className="text-muted-foreground">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                </span>
                <Button
                  variant="ghost"
                  className="pl-1"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    loginForm.reset();
                    signupForm.reset();
                  }}
                  data-testid="button-toggle-auth-mode"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}