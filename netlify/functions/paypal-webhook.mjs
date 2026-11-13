import nodemailer from "nodemailer";

const getEnv = (name) => Netlify.env.get(name);

async function paypalAccessToken(clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) throw new Error("PayPal authentication failed");
  const data = await response.json();
  return data.access_token;
}

async function verifyWebhook(request, event, accessToken, webhookId) {
  const headers = request.headers;
  const verification = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event
  };

  if (Object.values(verification).some((value) => !value)) return false;

  const response = await fetch("https://api-m.paypal.com/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(verification)
  });
  if (!response.ok) throw new Error("Could not verify PayPal webhook");
  const result = await response.json();
  return result.verification_status === "SUCCESS";
}

async function getBuyerEmail(event, resource, accessToken) {
  const directEmail = resource?.payer?.email_address;
  if (directEmail) return directEmail;

  const orderId = resource?.supplementary_data?.related_ids?.order_id;
  if (!orderId) return null;

  const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const order = await response.json();

  const captureIds = (order.purchase_units || []).flatMap((unit) =>
    (unit.payments?.captures || []).map((capture) => capture.id)
  );
  if (!captureIds.includes(resource.id)) return null;
  return order.payer?.email_address || null;
}

async function updateSale(url, key, id, patch, status) {
  const response = await fetch(
    `${url}/rest/v1/sales?id=eq.${id}&email_status=eq.${status}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    }
  );
  if (!response.ok) throw new Error("Could not update email delivery status");
  return response.json();
}

async function sendCertificate(email) {
  const gmailUser = getEnv("GMAIL_USER");
  const appPassword = getEnv("GMAIL_APP_PASSWORD");
  const host = getEnv("SMTP_HOST");
  const port = Number(getEnv("SMTP_PORT") || "465");
  if (!gmailUser || !appPassword || !host) throw new Error("Gmail SMTP settings are not configured");

  const certificateUrl = "https://raw.githubusercontent.com/ethingraham11-design/one-dollar-experiment/main/The%20%241%20Experiment%20Certificate.pdf";
  const pdfResponse = await fetch(certificateUrl);
  if (!pdfResponse.ok) throw new Error("Could not download the certificate PDF");
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: gmailUser, pass: appPassword }
  });

  await transporter.sendMail({
    from: `The One Dollar Experiment <${gmailUser}>`,
    to: email,
    subject: "Your One Dollar Experiment certificate",
    text: "Thank you for taking part in The One Dollar Experiment. Your participation certificate is attached.",
    attachments: [{
      filename: "The One Dollar Experiment Certificate.pdf",
      content: pdf,
      contentType: "application/pdf"
    }]
  });
  transporter.close();
}

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const clientId = getEnv("PAYPAL_CLIENT_ID");
  const clientSecret = getEnv("PAYPAL_CLIENT_SECRET");
  const webhookId = getEnv("PAYPAL_WEBHOOK_ID");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!clientId || !clientSecret || !webhookId || !supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Payment processing is not fully configured" }, { status: 503 });
  }

  let event;
  try {
    event = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return Response.json({ received: true, ignored: true });
  }

  try {
    const accessToken = await paypalAccessToken(clientId, clientSecret);
    const verified = await verifyWebhook(request, event, accessToken, webhookId);
    if (!verified) return Response.json({ error: "PayPal signature verification failed" }, { status: 401 });

    const capture = event.resource || {};
    const amount = capture.amount?.value;
    const currency = capture.amount?.currency_code;
    if (capture.status !== "COMPLETED" || amount !== "1.00" || currency !== "USD" || !capture.id) {
      return Response.json({ received: true, ignored: true, reason: "Not a completed $1.00 USD capture" });
    }

    const buyerEmail = await getBuyerEmail(event, capture, accessToken);
    if (!buyerEmail) throw new Error("PayPal did not provide a buyer email address");

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/sales`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        transaction_id: capture.id,
        amount: "1.00",
        currency: "USD",
        buyer_email: buyerEmail,
        email_status: "pending"
      })
    });

    let sale;
    if (insertResponse.ok) {
      const inserted = await insertResponse.json();
      sale = inserted[0];
    } else if (insertResponse.status === 409) {
      const existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/sales?transaction_id=eq.${encodeURIComponent(capture.id)}&select=id,buyer_email,email_status`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (!existingResponse.ok) throw new Error("Could not check the existing payment record");
      const existing = await existingResponse.json();
      sale = existing[0];
      if (!sale) throw new Error("Payment record could not be found after duplicate response");
    } else {
      throw new Error("Could not save the confirmed payment");
    }

    if (!sale.buyer_email) {
      const updateEmail = await fetch(`${supabaseUrl}/rest/v1/sales?id=eq.${sale.id}`, {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ buyer_email: buyerEmail })
      });
      if (!updateEmail.ok) throw new Error("Could not save the buyer email");
    }

    let claimed = await updateSale(supabaseUrl, supabaseKey, sale.id, { email_status: "sending", email_error: null }, "pending");
    if (!claimed.length) {
      claimed = await updateSale(supabaseUrl, supabaseKey, sale.id, { email_status: "sending", email_error: null }, "failed");
    }
    if (!claimed.length) {
      return Response.json({ received: true, duplicate: true, email_status: sale.email_status || "already processing" });
    }

    try {
      await sendCertificate(buyerEmail);
      const sent = await updateSale(supabaseUrl, supabaseKey, sale.id, {
        email_status: "sent",
        email_sent_at: new Date().toISOString(),
        email_error: null
      }, "sending");
      if (!sent.length) throw new Error("Email was sent but its status could not be saved");
    } catch (emailError) {
      await updateSale(supabaseUrl, supabaseKey, sale.id, {
        email_status: "failed",
        email_error: String(emailError.message || emailError).slice(0, 500)
      }, "sending");
      throw emailError;
    }

    return Response.json({ received: true, counted: true, certificate_sent: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
};
