import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Loader2, Copy, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EscrowPaySDK, TokenType } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Safely convert any error to a string message
 */
function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  
  // Check for Error object
  if (error instanceof Error) {
    return error.message || 'An error occurred';
  }
  
  // Check for object with message
  if (typeof error === 'object') {
    const obj = error as Record<string, any>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.msg === 'string') return obj.msg;
    if (typeof obj.error === 'string') return obj.error;
    
    // Try to stringify
    try {
      const str = JSON.stringify(error);
      if (str && str !== '{}') {
        return str.length > 150 ? str.substring(0, 150) + '...' : str;
      }
    } catch {
      // Ignore
    }
  }
  
  return 'An error occurred';
}

const CreateInvoiceForm: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [tokenType, setTokenType] = useState<TokenType>(TokenType.USDC);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{
    invoiceId: string;
    signature: string;
  } | null>(null);

  const sdk = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: 'confirmed' }
    );
    const instance = new EscrowPaySDK(provider);
    if (!instance.isInitialized()) {
      console.error('SDK failed to initialize:', instance.getInitError());
    }
    return instance;
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sdk || !connected || !publicKey) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    if (!sdk.isInitialized()) {
      toast({ title: 'SDK not initialized', description: sdk.getInitError() || 'Please try again', variant: 'destructive' });
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    
    if (!description.trim()) {
      toast({ title: 'Description required', variant: 'destructive' });
      return;
    }
    
    if (!clientEmail.trim() || !clientEmail.includes('@')) {
      toast({ title: 'Valid email required', variant: 'destructive' });
      return;
    }
    
    setIsCreating(true);
    
    try {
      const invoiceId = sdk.generateInvoiceId();
      
      const result = await sdk.createInvoice({
        invoiceId,
        amount: amountNum,
        description: description.trim(),
        clientEmail: clientEmail.trim(),
        tokenType,
      });
      
      if (result.success && result.data) {
        const invoiceUrl = `${window.location.origin}/invoice/${result.data.invoiceId}/${publicKey?.toBase58()}`;
        
        setCreatedInvoice({
          invoiceId: result.data.invoiceId,
          signature: result.data.signature,
        });
        toast({ title: 'Invoice created' });
        
        // Send email notification to client (only if Supabase is configured)
        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
          try {
            const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                clientEmail: clientEmail.trim(),
                invoiceId: result.data.invoiceId,
                amount: amountNum,
                tokenType: tokenType === TokenType.USDC ? 'USDC' : 'SOL',
                description: description.trim(),
                paymentUrl: invoiceUrl,
                creatorAddress: publicKey?.toBase58(),
              }),
            });

            const emailData = await emailRes.json();
            if (emailRes.ok) {
              toast({ title: 'Email sent to client' });
            } else {
              console.error('Email sending failed:', emailData);
              toast({ title: 'Email failed to send', description: emailData?.error || 'Unknown error', variant: 'destructive' });
            }
          } catch (emailErr) {
            console.warn('Failed to send email notification:', emailErr);
            // Don't show error toast - invoice was created successfully
          }
        }
      } else {
        // result.error should always be a string from SDK
        const errorMsg = getErrorMessage(result.error);
        console.log('Create invoice failed:', errorMsg);
        toast({ title: 'Failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (error: unknown) {
      console.error('Create invoice exception:', error);
      const errorMsg = getErrorMessage(error);
      
      // Check for common error patterns
      let displayMsg = errorMsg;
      if (errorMsg.includes('User rejected') || errorMsg.includes('rejected the request')) {
        displayMsg = 'Transaction cancelled.';
      } else if (errorMsg.toLowerCase().includes('insufficient')) {
        displayMsg = 'Insufficient balance.';
      }
      
      toast({ title: 'Error', description: displayMsg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const invoiceUrl = createdInvoice 
    ? `${window.location.origin}/invoice/${createdInvoice.invoiceId}/${publicKey?.toBase58()}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  if (!connected) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to create an invoice.</p>
        </CardContent>
      </Card>
    );
  }

  if (createdInvoice) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-1">Invoice Created</h3>
            <p className="text-sm text-muted-foreground">Share this link with your client</p>
          </div>
          
          <div className="space-y-4">
            <div className="p-3 rounded bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Invoice ID</p>
              <p className="font-mono font-medium text-foreground">{createdInvoice.invoiceId}</p>
            </div>
            
            <div className="p-3 rounded bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Payment Link</p>
              <p className="text-xs font-mono text-foreground break-all mb-2">{invoiceUrl}</p>
              <Button onClick={handleCopy} className="w-full" size="sm">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy Link'}
              </Button>
            </div>
            
            <a
              href={`https://explorer.solana.com/tx/${createdInvoice.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-primary hover:underline"
            >
              View on Solana Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => {
              setCreatedInvoice(null);
              setAmount('');
              setDescription('');
              setClientEmail('');
            }}>
              Create Another
            </Button>
            <Button className="flex-1" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Create Invoice</CardTitle>
        <CardDescription>Create an escrow-protected invoice</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Token Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Token</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={tokenType === TokenType.USDC ? 'default' : 'outline'}
                size="sm"
                className={tokenType === TokenType.USDC ? 'bg-secondary' : ''}
                onClick={() => setTokenType(TokenType.USDC)}
              >
                USDC
              </Button>
              <Button
                type="button"
                variant={tokenType === TokenType.SOL ? 'default' : 'outline'}
                size="sm"
                className={tokenType === TokenType.SOL ? 'bg-secondary' : ''}
                onClick={() => setTokenType(TokenType.SOL)}
              >
                SOL
              </Button>
            </div>
          </div>
          
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              Amount ({tokenType === TokenType.USDC ? 'USDC' : 'SOL'})
            </Label>
            <Input
              id="amount"
              type="number"
              step={tokenType === TokenType.USDC ? '0.01' : '0.0001'}
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="clean-input"
            />
          </div>
          
          {/* Client Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Client Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="client@company.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="clean-input"
            />
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the work or services..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] clean-input resize-none"
            />
          </div>
          
          {/* Info */}
          <div className="p-3 rounded bg-muted text-xs text-muted-foreground">
            <p>A 1% platform fee will be added when your client pays. You will receive 100% of the invoice amount.</p>
          </div>
          
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90" disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Invoice'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreateInvoiceForm;