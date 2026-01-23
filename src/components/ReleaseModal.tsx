import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReleaseModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: string;
  isReleasing: boolean;
}

const ReleaseModal: React.FC<ReleaseModalProps> = ({
  open,
  onClose,
  onConfirm,
  amount,
  isReleasing,
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Confirm Release
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            You are about to release <span className="font-medium text-foreground">{amount}</span> from escrow.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="p-4 rounded bg-muted">
            <p className="text-sm text-foreground leading-relaxed">
              Release funds only after work is completed. This action cannot be undone.
            </p>
          </div>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isReleasing}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isReleasing}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {isReleasing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Releasing...
              </>
            ) : (
              'Confirm Release'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReleaseModal;
