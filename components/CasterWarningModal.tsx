import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Scale, Copyright, Wifi } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CasterWarningModalProps {
  open: boolean;
  onAccept: (dontShowAgain: boolean) => void;
}

export function CasterWarningModal({ open, onAccept }: CasterWarningModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(true);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh]" data-testid="modal-caster-warning">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Important Legal and Technical Notices
          </DialogTitle>
          <DialogDescription>
            Please read and acknowledge the following before starting your broadcast
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Section 1: Personal Liability */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">1. Caster Personal Liability (Defamation & Slander)</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground pl-7">
                <p>
                  <strong className="text-foreground">Defamation and Slander:</strong> You are personally and legally responsible for all statements made during your live stream. Booth explicitly prohibits making false, malicious, or defamatory statements about any person, entity, or organization.
                </p>
                <p>
                  <strong className="text-foreground">Privacy Violations:</strong> Do not share private, confidential, or personally identifying information (phone numbers, home addresses, etc.) about yourself or others.
                </p>
                <p>
                  <strong className="text-foreground">Language and Conduct:</strong> Adhere to the platform's Code of Conduct regarding profanity, harassment, and abusive language.
                </p>
              </div>
            </div>

            {/* Section 2: Copyright & IP */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Copyright className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">2. Legal Protections for Booth (Copyright & IP)</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground pl-7">
                <p className="text-destructive font-semibold">
                  <strong className="text-destructive">Strict Copyright Warning (CRITICAL):</strong> Your stream must contain ONLY original commentary audio. DO NOT incorporate, broadcast, or transmit any audio protected by copyright, including:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong className="text-foreground">Live TV/Broadcast Audio:</strong> Do not allow the sound from the video stream you are commenting on (e.g., a network's live sound feed) to be picked up or transmitted.
                  </li>
                  <li>
                    <strong className="text-foreground">Commercial Music:</strong> Do not play copyrighted music in the background.
                  </li>
                </ul>
                <p>
                  <strong className="text-foreground">Waiver of Expectation of Privacy:</strong> You acknowledge that Booth reserves the right to monitor, moderate, record, and remove your stream at any time without prior notice if a violation is suspected.
                </p>
              </div>
            </div>

            {/* Section 3: Technical Warning */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">3. Technical & Reliability Warning</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground pl-7">
                <p>
                  The quality and availability of your stream is dependent on your internet connection, microphone quality, and device resources. Booth is not responsible for drops, lag, or poor audio quality.
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-4 sm:flex-col">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              data-testid="checkbox-dont-show-again"
            />
            <Label
              htmlFor="dont-show-again"
              className="text-sm font-normal cursor-pointer"
            >
              I understand these terms. Don't show this warning again.
            </Label>
          </div>
          <Button
            onClick={() => onAccept(dontShowAgain)}
            className="w-full"
            data-testid="button-accept-caster-warning"
          >
            I Understand and Start Casting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
