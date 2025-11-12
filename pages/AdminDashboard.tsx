import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import Loading from "@/pages/Loading";
import { Link } from "wouter";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";
import { 
  Users, 
  Radio, 
  TrendingUp, 
  Activity, 
  BarChart3, 
  Calendar, 
  Clock,
  Eye,
  RefreshCw,
  UserCheck,
  Crown,
  Play
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AppHeader from "@/components/AppHeader";

interface UserRegistrationStats {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  dailyRegistrations: { date: string; count: number }[];
}

interface CastingStats {
  totalCasters: number;
  activeCasters: number;
  totalStreamSessions: number;
  liveStreams: number;
  avgSessionDuration: number;
}

interface PlatformMetrics {
  totalUsers: number;
  totalCasters: number;
  totalListeners: number;
  totalAdmins: number;
  totalEvents: number;
  liveEvents: number;
  totalStreamSessions: number;
  totalTips: number;
  totalMarkers: number;
}

interface UserWithCastingStats {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  screenname: string | null;
  role: "caster" | "listener" | "admin";
  canCast: boolean;
  createdAt: string | null;
  totalStreamSessions: number;
  totalStreamTime: number; // in seconds
  lastStreamDate: string | null;
  isCurrentlyLive: boolean;
}

export default function AdminDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState<number>(30);

  // Fetch user registration stats
  const { data: userStats, isLoading: userStatsLoading, refetch: refetchUserStats } = useQuery<UserRegistrationStats>({
    queryKey: ['/api/admin/stats/users', { days: timeRange }],
    enabled: user?.role === 'admin'
  });

  // Fetch casting stats
  const { data: castingStats, isLoading: castingStatsLoading, refetch: refetchCastingStats } = useQuery<CastingStats>({
    queryKey: ['/api/admin/stats/casting'],
    enabled: user?.role === 'admin'
  });

  // Fetch platform metrics
  const { data: platformMetrics, isLoading: platformLoading, refetch: refetchPlatformMetrics } = useQuery<PlatformMetrics>({
    queryKey: ['/api/admin/stats/platform'],
    enabled: user?.role === 'admin'
  });

  // Fetch all users with casting stats
  const { data: allUsers, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserWithCastingStats[]>({
    queryKey: ['/api/admin/users'],
    enabled: user?.role === 'admin'
  });

  const handleRefresh = () => {
    refetchUserStats();
    refetchCastingStats();
    refetchPlatformMetrics();
    refetchUsers();
  };

  if (authLoading) {
    return <Loading />;
  }

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="w-5 h-5" />
              <p>Access denied. Admin privileges required.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = userStatsLoading || castingStatsLoading || platformLoading;

  // Format duration from seconds to readable format
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      {/* Admin Dashboard Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">
              Admin Dashboard
            </h1>
            <Button onClick={handleRefresh} disabled={isLoading} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Dashboard Content */}
        <div className="space-y-2">
          <p className="text-muted-foreground">
            Monitor platform usage and user activity
          </p>
        </div>

      {/* Platform Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-total-users">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">
              {isLoading ? "..." : platformMetrics?.totalUsers?.toLocaleString() ?? "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              Platform registrations
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-casters">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Casters</CardTitle>
            <Radio className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-casters">
              {isLoading ? "..." : platformMetrics?.totalCasters?.toLocaleString() ?? "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              Verified broadcasters
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-live-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Events</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-live-events">
              {isLoading ? "..." : platformMetrics?.liveEvents?.toLocaleString() ?? "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently broadcasting
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-sessions">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stream Sessions</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stream-sessions">
              {isLoading ? "..." : platformMetrics?.totalStreamSessions?.toLocaleString() ?? "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              All-time sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList data-testid="tabs-analytics">
          <TabsTrigger value="users">User Analytics</TabsTrigger>
          <TabsTrigger value="casting">Casting Analytics</TabsTrigger>
          <TabsTrigger value="overview">Platform Overview</TabsTrigger>
          <TabsTrigger value="management">User Management</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">User Registration Trends</h2>
            <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(parseInt(value))}>
              <SelectTrigger className="w-32" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-users-today">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">New Users Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-new-users-today">
                  {isLoading ? "..." : userStats?.newUsersToday || 0}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-users-week">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">New Users This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600" data-testid="text-new-users-week">
                  {isLoading ? "..." : userStats?.newUsersThisWeek || 0}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-users-month">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">New Users This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600" data-testid="text-new-users-month">
                  {isLoading ? "..." : userStats?.newUsersThisMonth || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* User Registration Chart */}
          {userStats?.dailyRegistrations && userStats.dailyRegistrations.length > 0 && (
            <Card data-testid="card-registration-chart">
              <CardHeader>
                <CardTitle>Daily User Registrations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={userStats.dailyRegistrations}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value) => [`${value} users`, 'New Registrations']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#2563eb" 
                        strokeWidth={2}
                        dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="casting" className="space-y-4">
          <h2 className="text-xl font-semibold">Casting Activity</h2>
          
          {/* Casting Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-active-casters">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  Active Casters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-casters">
                  {isLoading ? "..." : castingStats?.activeCasters || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cast in last 7 days
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-live-streams">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Live Streams
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500" data-testid="text-live-streams">
                  {isLoading ? "..." : castingStats?.liveStreams || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Currently live
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-session-count">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Total Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-session-count">
                  {isLoading ? "..." : castingStats?.totalStreamSessions || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  All-time streams
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-avg-duration">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Avg Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-duration">
                  {isLoading ? "..." : castingStats ? formatDuration(castingStats.avgSessionDuration) : "0m"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Per stream session
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <h2 className="text-xl font-semibold">Platform Overview</h2>
          
          {/* Platform Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card data-testid="card-platform-users">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">User Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Listeners:</span>
                  <Badge variant="secondary" data-testid="badge-listeners">
                    {isLoading ? "..." : platformMetrics?.totalListeners || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Casters:</span>
                  <Badge variant="default" data-testid="badge-casters">
                    {isLoading ? "..." : platformMetrics?.totalCasters || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Admins:</span>
                  <Badge variant="outline" data-testid="badge-admins">
                    {isLoading ? "..." : platformMetrics?.totalAdmins || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-platform-events">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Event Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Total Events:</span>
                  <Badge variant="secondary" data-testid="badge-total-events">
                    {isLoading ? "..." : platformMetrics?.totalEvents || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Live Events:</span>
                  <Badge variant="destructive" data-testid="badge-live-events">
                    {isLoading ? "..." : platformMetrics?.liveEvents || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-platform-engagement">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">User Engagement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Total Tips:</span>
                  <Badge variant="secondary" data-testid="badge-total-tips">
                    {isLoading ? "..." : platformMetrics?.totalTips || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Total Markers:</span>
                  <Badge variant="outline" data-testid="badge-total-markers">
                    {isLoading ? "..." : platformMetrics?.totalMarkers || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <h2 className="text-xl font-semibold">User Management</h2>
          
          {/* Users Table */}
          <Card data-testid="card-users-table">
            <CardHeader>
              <CardTitle>All Users ({allUsers?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center p-6">
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                  Loading users...
                </div>
              ) : allUsers && allUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">User</th>
                        <th className="text-left p-2 font-medium">Role</th>
                        <th className="text-left p-2 font-medium">Casting</th>
                        <th className="text-left p-2 font-medium">Stream Sessions</th>
                        <th className="text-left p-2 font-medium">Total Stream Time</th>
                        <th className="text-left p-2 font-medium">Last Stream</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-muted/50" data-testid={`row-user-${user.id}`}>
                          <td className="p-2">
                            <div>
                              <div className="font-medium" data-testid={`text-user-name-${user.id}`}>
                                {user.screenname || user.username || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'}
                              </div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                                {user.email}
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <Badge 
                              variant={user.role === 'admin' ? 'destructive' : user.role === 'caster' ? 'default' : 'secondary'}
                              data-testid={`badge-user-role-${user.id}`}
                            >
                              {user.role === 'admin' && <Crown className="w-3 h-3 mr-1" />}
                              {user.role === 'caster' && <Radio className="w-3 h-3 mr-1" />}
                              {user.role === 'listener' && <Users className="w-3 h-3 mr-1" />}
                              {user.role}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <Badge 
                              variant={user.canCast ? 'default' : 'outline'}
                              data-testid={`badge-user-casting-${user.id}`}
                            >
                              {user.canCast ? <UserCheck className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                              {user.canCast ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono" data-testid={`text-user-sessions-${user.id}`}>
                            {user.totalStreamSessions}
                          </td>
                          <td className="p-2" data-testid={`text-user-stream-time-${user.id}`}>
                            {formatDuration(user.totalStreamTime)}
                          </td>
                          <td className="p-2 text-sm" data-testid={`text-user-last-stream-${user.id}`}>
                            {user.lastStreamDate 
                              ? new Date(user.lastStreamDate).toLocaleDateString() 
                              : 'Never'}
                          </td>
                          <td className="p-2">
                            {user.isCurrentlyLive ? (
                              <Badge variant="destructive" data-testid={`badge-user-live-${user.id}`}>
                                <Play className="w-3 h-3 mr-1" />
                                Live
                              </Badge>
                            ) : (
                              <Badge variant="outline" data-testid={`badge-user-offline-${user.id}`}>
                                Offline
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 text-sm" data-testid={`text-user-joined-${user.id}`}>
                            {user.createdAt 
                              ? new Date(user.createdAt).toLocaleDateString() 
                              : 'Unknown'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center p-6 text-muted-foreground">
                  <Users className="w-5 h-5 mr-2" />
                  No users found
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="card-summary-total">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-summary-total">
                  {allUsers?.length || 0}
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-summary-casters">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Users with Casting</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-summary-casters">
                  {allUsers?.filter(u => u.canCast).length || 0}
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-summary-active">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Streamers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-summary-active">
                  {allUsers?.filter(u => u.totalStreamSessions > 0).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Have streamed before
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-summary-live">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Currently Live</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500" data-testid="text-summary-live">
                  {allUsers?.filter(u => u.isCurrentlyLive).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Streaming now
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}