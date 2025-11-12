import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Check, 
  X, 
  AlertCircle, 
  Eye, 
  Trash2, 
  Loader2,
  Info
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getUserDisplayName } from "@/lib/utils";

interface ScreennameSettingsProps {
  user: any;
  onUpdate?: () => void;
}

const screennameSchema = z.object({
  screenname: z.union([
    z.string()
      .min(3, "Screenname must be at least 3 characters")
      .max(32, "Screenname cannot exceed 32 characters")
      .regex(/^[a-zA-Z0-9_-]+$/, "Screenname can only contain letters, numbers, underscores, and hyphens"),
    z.literal(""), // Allow empty string to clear screenname
  ]),
});

type ScreennameFormData = z.infer<typeof screennameSchema>;

export default function ScreennameSettings({ user, onUpdate }: ScreennameSettingsProps) {
  const [previewName, setPreviewName] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<ScreennameFormData>({
    resolver: zodResolver(screennameSchema),
    defaultValues: {
      screenname: user?.screenname || "",
    },
    mode: "onChange",
  });

  const watchedScreenname = watch("screenname");

  // Update preview when screenname changes
  useEffect(() => {
    const trimmedName = watchedScreenname?.trim() || "";
    
    if (trimmedName) {
      setPreviewName(trimmedName);
      setShowPreview(true);
    } else {
      // If empty, show what the fallback name would be
      const fallbackName = getUserDisplayName(user);
      setPreviewName(fallbackName);
      setShowPreview(true);
    }
  }, [watchedScreenname, user]);

  // Reset form when user prop changes
  useEffect(() => {
    reset({
      screenname: user?.screenname || "",
    });
  }, [user?.screenname, reset]);

  const updateScreennameMutation = useMutation({
    mutationFn: async (data: ScreennameFormData) => {
      const payload = {
        screenname: data.screenname.trim() || null, // Send null for empty strings
      };
      return apiRequest("PUT", "/api/user/profile", payload);
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Screenname Updated",
        description: "Your display name has been updated successfully.",
      });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update screenname. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit_ = (data: ScreennameFormData) => {
    updateScreennameMutation.mutate(data);
  };

  const handleClearScreenname = () => {
    setValue("screenname", "", { shouldValidate: true, shouldDirty: true });
  };

  const isCurrentlyEmpty = !user?.screenname;
  const willBecomeEmpty = watchedScreenname === "";
  const hasChanges = isDirty && isValid && !errors.screenname;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5" />
          Display Name Settings
        </CardTitle>
        <CardDescription>
          Choose how your name appears to listeners. This will be shown in chat, event listings, and your profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Display Name */}
        <div>
          <Label className="text-sm font-medium">Current Display Name</Label>
          <div className="mt-2">
            <Badge variant="outline" className="text-base px-3 py-1">
              {getUserDisplayName(user)}
            </Badge>
            <p className="text-sm text-muted-foreground mt-1">
              {user?.screenname ? "Using custom screenname" : "Using your real name"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Screenname Input Form */}
        <form onSubmit={handleSubmit(handleSubmit_)} className="space-y-4">
          <div>
            <Label htmlFor="screenname" className="text-sm font-medium">
              Custom Screenname (Optional)
            </Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="screenname"
                  placeholder="Enter your screenname"
                  {...register("screenname")}
                  className={errors.screenname ? "border-destructive" : ""}
                  data-testid="input-screenname"
                />
                {!isCurrentlyEmpty && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleClearScreenname}
                    title="Clear screenname"
                    data-testid="button-clear-screenname"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              {/* Validation Error */}
              {errors.screenname && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errors.screenname.message}</AlertDescription>
                </Alert>
              )}

              {/* Requirements Info */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  3-32 characters, letters, numbers, underscores, and hyphens only
                </p>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          {showPreview && (
            <div className="border rounded-lg p-4 bg-muted/20">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </Label>
              <div className="mt-2">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {previewName}
                </Badge>
                <p className="text-sm text-muted-foreground mt-1">
                  {willBecomeEmpty 
                    ? "Will use your real name if you save with no screenname"
                    : "How your name will appear to listeners"
                  }
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!hasChanges || updateScreennameMutation.isPending}
              data-testid="button-save-screenname"
            >
              {updateScreennameMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
            
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => reset()}
                disabled={updateScreennameMutation.isPending}
                data-testid="button-cancel-screenname"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Your screenname is public and will be visible to all listeners. 
            Leave empty to use your real name instead.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}