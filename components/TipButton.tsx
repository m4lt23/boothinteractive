import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Heart } from "lucide-react";
import { useState } from "react";

interface TipButtonProps {
  casterName: string;
  onTip?: (amount: number, message: string) => void;
}

export default function TipButton({ casterName, onTip }: TipButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const presetAmounts = [1, 5, 10, 25];

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      setSelectedAmount(numValue);
    } else {
      setSelectedAmount(null);
    }
  };

  const handleSubmitTip = () => {
    if (!selectedAmount || selectedAmount <= 0) return;
    
    setIsProcessing(true);
    console.log(`Tipping ${casterName} $${selectedAmount} with message: "${message}"`);
    
    onTip?.(selectedAmount, message);
    
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      setIsOpen(false);
      setSelectedAmount(null);
      setCustomAmount("");
      setMessage("");
    }, 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" data-testid="button-tip">
          <DollarSign className="w-4 h-4" />
          Tip
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md" data-testid="dialog-tip">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            Tip {casterName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Preset Amounts */}
          <div className="space-y-2">
            <Label>Quick Amounts</Label>
            <div className="grid grid-cols-4 gap-2">
              {presetAmounts.map((amount) => (
                <Button
                  key={amount}
                  variant={selectedAmount === amount ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleAmountSelect(amount)}
                  data-testid={`button-amount-${amount}`}
                >
                  ${amount}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Custom Amount */}
          <div className="space-y-2">
            <Label htmlFor="custom-amount">Custom Amount ($)</Label>
            <Input
              id="custom-amount"
              type="number"
              placeholder="Enter amount"
              value={customAmount}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              min="0.01"
              step="0.01"
              data-testid="input-custom-amount"
            />
          </div>
          
          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="tip-message">Message (optional)</Label>
            <Textarea
              id="tip-message"
              placeholder="Leave a message for the caster..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              data-testid="input-message"
            />
          </div>
          
          {/* Total Display */}
          {selectedAmount && (
            <div className="p-3 bg-muted rounded-lg" data-testid="text-total">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total:</span>
                <span className="text-lg font-bold">${selectedAmount.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          {/* Submit Button */}
          <Button 
            onClick={handleSubmitTip}
            disabled={!selectedAmount || selectedAmount <= 0 || isProcessing}
            className="w-full gap-2"
            data-testid="button-submit-tip"
          >
            <DollarSign className="w-4 h-4" />
            {isProcessing ? "Processing..." : `Tip $${selectedAmount?.toFixed(2) || "0.00"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}