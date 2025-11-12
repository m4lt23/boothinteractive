import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Radio, Settings, Users, UserPlus, Mail, Check, X, HandHeart, PartyPopper } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getUserDisplayName } from "@/lib/utils";
import ScreennameSettings from "./ScreennameSettings";

interface UserProfileProps {
  user: any;
  onUpdate?: () => void;
}

export default function UserProfile({ user, onUpdate }: UserProfileProps) {
  const [isEditingCasterProfile, setIsEditingCasterProfile] = useState(false);
  const [bio, setBio] = useState(user?.bio || "");
  const [teamsCovered, setTeamsCovered] = useState(user?.teamsCovered?.join(", ") || "");
  
  // Partnership invitation form state
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [partnershipName, setPartnershipName] = useState("");
  const [invitationMessage, setInvitationMessage] = useState("");
  
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const requestCastingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/request-casting", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome to BOOTH Casting! 🎙️",
        description: "You're now a certified caster! Start a stream to invite co-casters.",
      });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit casting request",
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { bio: string; teamsCovered: string[] }) => {
      return apiRequest("PUT", "/api/user/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile Updated",
        description: "Your caster profile has been updated successfully.",
      });
      setIsEditingCasterProfile(false);
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleUpdateProfile = () => {
    const teamsArray = teamsCovered
      .split(",")
      .map((team: string) => team.trim())
      .filter((team: string) => team.length > 0);
    
    updateProfileMutation.mutate({
      bio,
      teamsCovered: teamsArray,
    });
  };

  const promoteToAdminMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/promote-to-admin", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Admin Access Granted",
        description: "You now have admin privileges and can create events.",
      });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to promote to admin",
        variant: "destructive",
      });
    },
  });

  // Partnership queries and mutations
  const { data: partnerships = [] } = useQuery({
    queryKey: ["/api/partnerships"],
    enabled: !!user?.canCast,
  }) as { data: any[] };

  const { data: invitations = [] } = useQuery({
    queryKey: ["/api/partnerships/invitations"],
    enabled: !!user?.canCast,
  }) as { data: any[] };

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { toCasterEmail: string; partnershipName: string; message: string }) => {
      // In a real implementation, we'd need an endpoint to lookup users by email
      // For now, we'll create a simple invitation system
      return apiRequest("POST", "/api/partnerships/invitations", {
        toCasterId: "placeholder-id", // This would be resolved from email
        partnershipName: data.partnershipName,
        message: data.message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships/invitations"] });
      toast({
        title: "Invitation Sent",
        description: "Partnership invitation has been sent successfully.",
      });
      setShowInvitationForm(false);
      setInvitationEmail("");
      setPartnershipName("");
      setInvitationMessage("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const respondToInvitationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/partnerships/invitations/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships/invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partnerships"] });
      toast({
        title: "Invitation Updated",
        description: "Partnership invitation has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invitation",
        variant: "destructive",
      });
    },
  });

  const handleSendInvitation = () => {
    if (!invitationEmail || !partnershipName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    createInvitationMutation.mutate({
      toCasterEmail: invitationEmail,
      partnershipName,
      message: invitationMessage,
    });
  };


  // Filter invitations
  const incomingInvitations = (invitations as any[]).filter((inv: any) => inv.toCasterId === user?.id && inv.status === "pending");
  const outgoingInvitations = (invitations as any[]).filter((inv: any) => inv.fromCasterId === user?.id && inv.status === "pending");

  return (
    <div className="space-y-6">
      {/* Basic Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Name</Label>
            <p className="text-sm text-muted-foreground">
              {getUserDisplayName(user)}
            </p>
          </div>
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Account Type</Label>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary">Listener</Badge>
              {user?.canCast && <Badge variant="default">Caster</Badge>}
              {user?.role === 'admin' && <Badge className="bg-purple-600">Admin</Badge>}
            </div>
          </div>
          {user?.role !== 'admin' && (
            <div className="border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => promoteToAdminMutation.mutate()}
                disabled={promoteToAdminMutation.isPending}
                data-testid="button-become-admin"
              >
                {promoteToAdminMutation.isPending ? "Processing..." : "Become Admin"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Grant yourself admin access to create and manage events
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Screenname Settings */}
      <ScreennameSettings user={user} onUpdate={onUpdate} />

      {/* Casting Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5" />
            Broadcasting Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.canCast ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Casting Enabled</p>
                  <p className="text-sm text-muted-foreground">
                    You can create and broadcast live commentary events
                  </p>
                </div>
                <Badge variant="default" className="gap-1">
                  <Radio className="w-3 h-3" />
                  Active Caster
                </Badge>
              </div>
              
              {/* Caster Profile Editor */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">Caster Profile</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingCasterProfile(!isEditingCasterProfile)}
                    data-testid="button-edit-profile"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {isEditingCasterProfile ? "Cancel" : "Edit"}
                  </Button>
                </div>
                
                {isEditingCasterProfile ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        placeholder="Tell listeners about your commentary style and expertise..."
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        data-testid="textarea-bio"
                      />
                    </div>
                    <div>
                      <Label htmlFor="teams">Teams/Sports You Cover</Label>
                      <Input
                        id="teams"
                        placeholder="e.g., Kansas City Chiefs, Missouri Tigers"
                        value={teamsCovered}
                        onChange={(e) => setTeamsCovered(e.target.value)}
                        data-testid="input-teams"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Separate multiple teams with commas
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleUpdateProfile}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditingCasterProfile(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Bio</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.bio || "No bio provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Teams Covered</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.teamsCovered?.length ? user.teamsCovered.join(", ") : "No teams specified"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="space-y-2">
                <Users className="w-12 h-12 text-muted-foreground mx-auto" />
                <h4 className="font-medium">Become a Caster</h4>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Want to share your sports expertise? Request casting capabilities to start broadcasting live commentary.
                </p>
              </div>
              <Button
                onClick={() => requestCastingMutation.mutate()}
                disabled={requestCastingMutation.isPending}
                className="gap-2"
                data-testid="button-request-casting"
              >
                <Radio className="w-4 h-4" />
                {requestCastingMutation.isPending ? "Submitting..." : "Request Casting Access"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partnership Management - Only show for casters */}
      {user?.canCast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandHeart className="w-5 h-5" />
              Co-Casting Partnerships
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Partnerships */}
            <div>
              <h4 className="font-medium mb-3">Active Partnerships</h4>
              {(partnerships as any[]).length > 0 ? (
                <div className="space-y-2">
                  {(partnerships as any[]).map((partnership: any) => (
                    <div key={partnership.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{partnership.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Partnership with {partnership.caster1Id === user.id ? partnership.caster2?.firstName : partnership.caster1?.firstName}
                        </p>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active partnerships</p>
              )}
            </div>

            <Separator />

            {/* Pending Invitations */}
            <div>
              <h4 className="font-medium mb-3">Pending Invitations</h4>
              
              {/* Incoming Invitations */}
              {incomingInvitations.length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-sm font-medium text-green-600">Incoming Invitations</p>
                  {incomingInvitations.map((invitation: any) => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 border border-green-200 rounded-lg bg-green-50">
                      <div className="flex-1">
                        <p className="font-medium">{invitation.partnershipName}</p>
                        <p className="text-sm text-muted-foreground">
                          From: {getUserDisplayName(invitation.fromCaster)}
                        </p>
                        {invitation.message && (
                          <p className="text-sm text-muted-foreground mt-1">
                            "{invitation.message}"
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => respondToInvitationMutation.mutate({ id: invitation.id, status: "accepted" })}
                          disabled={respondToInvitationMutation.isPending}
                          data-testid={`button-accept-${invitation.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => respondToInvitationMutation.mutate({ id: invitation.id, status: "declined" })}
                          disabled={respondToInvitationMutation.isPending}
                          data-testid={`button-decline-${invitation.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Outgoing Invitations */}
              {outgoingInvitations.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-blue-600">Sent Invitations</p>
                  {outgoingInvitations.map((invitation: any) => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 border border-blue-200 rounded-lg bg-blue-50">
                      <div>
                        <p className="font-medium">{invitation.partnershipName}</p>
                        <p className="text-sm text-muted-foreground">
                          To: {getUserDisplayName(invitation.toCaster)}
                        </p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                  ))}
                </div>
              )}

              {incomingInvitations.length === 0 && outgoingInvitations.length === 0 && (
                <p className="text-sm text-muted-foreground">No pending invitations</p>
              )}
            </div>

            <Separator />

            {/* Send New Invitation */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Invite a Co-Caster</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInvitationForm(!showInvitationForm)}
                  data-testid="button-invite-caster"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {showInvitationForm ? "Cancel" : "Send Invitation"}
                </Button>
              </div>

              {showInvitationForm && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div>
                    <Label htmlFor="invitation-email">Caster's Email</Label>
                    <Input
                      id="invitation-email"
                      type="email"
                      placeholder="Enter the email of the caster you want to partner with"
                      value={invitationEmail}
                      onChange={(e) => setInvitationEmail(e.target.value)}
                      data-testid="input-invitation-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="partnership-name">Partnership Name</Label>
                    <Input
                      id="partnership-name"
                      placeholder="e.g., 'Mike & Sarah Sports Cast'"
                      value={partnershipName}
                      onChange={(e) => setPartnershipName(e.target.value)}
                      data-testid="input-partnership-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="invitation-message">Message (Optional)</Label>
                    <Textarea
                      id="invitation-message"
                      placeholder="Add a personal message to your invitation..."
                      value={invitationMessage}
                      onChange={(e) => setInvitationMessage(e.target.value)}
                      rows={3}
                      data-testid="textarea-invitation-message"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSendInvitation}
                      disabled={createInvitationMutation.isPending}
                      data-testid="button-send-invitation"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      {createInvitationMutation.isPending ? "Sending..." : "Send Invitation"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowInvitationForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}