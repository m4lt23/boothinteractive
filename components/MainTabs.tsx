import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, Users, TrendingUp, Settings } from "lucide-react";

interface MainTabsProps {
  value: string;
  onValueChange: (value: string) => void;
}

export default function MainTabs({ value, onValueChange }: MainTabsProps) {
  return (
    <div className="border-b bg-background">
      <div className="container mx-auto px-4">
        <Tabs value={value} onValueChange={onValueChange} className="py-2">
          <TabsList className="grid w-full grid-cols-4 md:w-auto md:grid-cols-4">
            <TabsTrigger value="live" className="gap-2">
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">Live</span>
            </TabsTrigger>
            <TabsTrigger value="following" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Following</span>
            </TabsTrigger>
            <TabsTrigger value="trending" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Trending</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}