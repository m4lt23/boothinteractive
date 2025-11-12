import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, UserCheck, Users, Radio, Calendar } from "lucide-react";
import { useState } from "react";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";

interface CasterProfileProps {
  caster: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    screenname?: string | null;
    profileImageUrl?: string;
    bio?: string;
    teamsCovered?: string[];
    followerCount?: number;
    isFollowing?: boolean;
  };
  upcomingEvents?: number;
  onFollow?: (casterId: string) => void;
  onUnfollow?: (casterId: string) => void;
}

export default function CasterProfile({ 
  caster, 
  upcomingEvents = 0, 
  onFollow, 
  onUnfollow 
}: CasterProfileProps) {
  const [isFollowing, setIsFollowing] = useState(caster.isFollowing || false);
  const [followerCount, setFollowerCount] = useState(caster.followerCount || 0);
  const [isLoading, setIsLoading] = useState(false);

  const displayName = getUserDisplayName(caster);
  const initials = getUserInitials(caster);

  const handleFollowToggle = async () => {
    setIsLoading(true);
    
    if (isFollowing) {
      console.log('Unfollowing caster:', caster.id);
      onUnfollow?.(caster.id);
      setIsFollowing(false);
      setFollowerCount(prev => prev - 1);
    } else {
      console.log('Following caster:', caster.id);
      onFollow?.(caster.id);
      setIsFollowing(true);
      setFollowerCount(prev => prev + 1);
    }
    
    // Simulate API delay
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <Card className="w-full max-w-md" data-testid={`card-caster-${caster.id}`}>
      <CardHeader className="text-center">
        <div className="flex flex-col items-center space-y-4">
          {/* Profile Image */}
          <Avatar className="w-20 h-20">
            <AvatarImage src={caster.profileImageUrl} alt={displayName} />
            <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
          </Avatar>
          
          {/* Name and Stats */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold" data-testid={`text-name-${caster.id}`}>
              {displayName}
            </h2>
            
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span data-testid={`text-followers-${caster.id}`}>{followerCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span data-testid={`text-upcoming-${caster.id}`}>{upcomingEvents} upcoming</span>
              </div>
            </div>
          </div>
          
          {/* Follow Button */}
          <Button
            onClick={handleFollowToggle}
            disabled={isLoading}
            variant={isFollowing ? "outline" : "default"}
            className="gap-2 min-w-[120px]"
            data-testid={`button-follow-${caster.id}`}
          >
            {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {isLoading ? "..." : isFollowing ? "Following" : "Follow"}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Bio */}
        {caster.bio && (
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Radio className="w-4 h-4" />
              About
            </h3>
            <p className="text-sm text-muted-foreground" data-testid={`text-bio-${caster.id}`}>
              {caster.bio}
            </p>
          </div>
        )}
        
        {/* Teams Covered */}
        {caster.teamsCovered && caster.teamsCovered.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Teams Covered</h3>
            <div className="flex flex-wrap gap-1">
              {caster.teamsCovered.map((team, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {team}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}