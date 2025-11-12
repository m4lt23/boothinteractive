import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Scale } from "lucide-react";

export default function TermsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          data-testid="button-back"
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Scale className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-3xl">Booth Terms and Conditions</CardTitle>
            </div>
            <p className="text-muted-foreground mt-2">
              Last Updated: January 1, 2025
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="text-base">
                By registering for an account on Booth, you agree that you have read, understand, and accept these Terms and Conditions (the "Terms").
              </p>

              <Separator className="my-6" />

              <h2 className="text-xl font-bold mt-6 mb-3">1. Acceptance and Compliance</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">1.1. Binding Agreement</h3>
                  <p className="text-muted-foreground">
                    By creating a Booth account, you enter into a legally binding agreement with Booth. If you do not agree to these Terms, you may not register or use the service.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">1.2. Capacity</h3>
                  <p className="text-muted-foreground">
                    You confirm that you are over the age of 13 or have the consent of a parent or guardian.
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <h2 className="text-xl font-bold mt-6 mb-3">2. User Content and Intellectual Property</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">2.1. Ownership of Commentary</h3>
                  <p className="text-muted-foreground">
                    You retain all ownership rights to your original, spoken commentary audio.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">2.2. Grant of License to Booth</h3>
                  <p className="text-muted-foreground">
                    You grant Booth a worldwide, royalty-free, perpetual license to host, display, distribute, and reproduce your commentary content solely for the purpose of operating, marketing, and improving the Booth platform.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">2.3. Strict Prohibition of Third-Party Audio (Copyright)</h3>
                  <p className="text-muted-foreground">
                    You are strictly prohibited from transmitting, embedding, or incorporating any third-party copyrighted audio (including licensed sports broadcast feeds, music tracks, or any other copyrighted material) into your commentary unless you own the rights or have explicit written permission from the rights holders. Violating this prohibition may result in immediate account suspension or termination, and you will be solely liable for any copyright infringement claims.
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <h2 className="text-xl font-bold mt-6 mb-3">3. User Conduct and Liability</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">3.1. Responsibility</h3>
                  <p className="text-muted-foreground">
                    You are solely and personally responsible for all content, statements, and actions that occur under your account.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">3.2. Prohibited Conduct</h3>
                  <p className="text-muted-foreground">
                    You must not transmit content that is: defamatory, harassing, hateful, illegal, obscene, or racially/ethnically offensive.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">3.3. Defamation and Slander</h3>
                  <p className="text-muted-foreground">
                    You agree to exercise caution and professional judgment in your commentary. You acknowledge that you are personally liable for any slanderous or defamatory statements made during live commentary. Booth is not responsible for monitoring content in real time and will not be held liable for your statements.
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <h2 className="text-xl font-bold mt-6 mb-3">4. Indemnification and Disclaimer</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">4.1. Indemnification (Protecting Booth)</h3>
                  <p className="text-muted-foreground">
                    You agree to indemnify, defend, and hold harmless Booth from and against any and all claims, damages, liabilities, and expenses (including legal fees) arising from your use of the service, including any claim of copyright infringement or defamation related to your commentary.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">4.2. Service "As Is"</h3>
                  <p className="text-muted-foreground">
                    The Booth service is provided "as is," without warranties of any kind. Booth does not guarantee that the service will be uninterrupted, secure, or error-free.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">4.3. Limitation of Liability</h3>
                  <p className="text-muted-foreground">
                    To the maximum extent permitted by law, Booth shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues.
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="bg-muted/50 p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  <strong>Important:</strong> By using Booth, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you have any questions or concerns, please contact us before using the service.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
