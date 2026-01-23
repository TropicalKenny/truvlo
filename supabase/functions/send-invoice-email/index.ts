import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvoiceEmailRequest {
  clientEmail: string;
  invoiceId: string;
  amount: string;
  tokenType: string;
  description: string;
  creatorAddress: string;
  paymentUrl: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: InvoiceEmailRequest = await req.json();
    const { clientEmail, invoiceId, amount, tokenType, description, creatorAddress, paymentUrl } = body;

    // Validate required fields
    if (!clientEmail || !invoiceId || !amount || !paymentUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Shorten creator address for display
    const shortCreator = creatorAddress 
      ? `${creatorAddress.slice(0, 4)}...${creatorAddress.slice(-4)}`
      : "Unknown";

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${invoiceId}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background-color: #12121a; border-radius: 16px; border: 1px solid #1e1e2e;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #1e1e2e;">
              <h1 style="margin: 0; color: #00d4ff; font-size: 24px; font-weight: 600;">EscrowPay</h1>
              <p style="margin: 8px 0 0; color: #888; font-size: 14px;">You've received an invoice</p>
            </td>
          </tr>
          
          <!-- Invoice Details -->
          <tr>
            <td style="padding: 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase;">Invoice ID</p>
                    <p style="margin: 0; color: #fff; font-size: 16px; font-family: monospace;">${invoiceId}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase;">Amount Due</p>
                    <p style="margin: 0; color: #00d4ff; font-size: 28px; font-weight: 600;">${amount} ${tokenType}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase;">From</p>
                    <p style="margin: 0; color: #fff; font-size: 14px; font-family: monospace;">${shortCreator}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase;">Description</p>
                    <p style="margin: 0; color: #ccc; font-size: 14px; line-height: 1.5;">${description || "No description provided"}</p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #0099cc); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Pay Invoice</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #1e1e2e; text-align: center;">
              <p style="margin: 0 0 8px; color: #666; font-size: 12px;">Payment is secured by escrow on Solana</p>
              <p style="margin: 0; color: #444; font-size: 11px;">Funds are held securely until released by the creator</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "EscrowPay <onboarding@resend.dev>",
        to: [clientEmail],
        subject: `Invoice ${invoiceId} - ${amount} ${tokenType}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
