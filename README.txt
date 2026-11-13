THE ONE DOLLAR EXPERIMENT — WEBSITE STARTER
===========================================

This is a deployable website starter, but it is NOT live until you deploy it and connect the database. It uses Netlify hosting/functions, Supabase database, and your existing PayPal payment link.

FILES
-----
index.html       Public homepage and $1 PayPal purchase button
thank-you.html   PayPal return page
admin.html       Admin page to record verified purchases
netlify/         Server functions for public counter and recording sales
 database.sql    Database table setup
styles.css       Website styling
app.js           Refreshes public counter every 15 seconds

1) CREATE THE DATABASE (SUPABASE)
---------------------------------
1. Create a free account at https://supabase.com/ and create a project.
2. Open SQL Editor in the Supabase dashboard.
3. Copy the contents of database.sql from this folder, paste into SQL Editor, and run it.
4. In Project Settings -> API / API Keys, copy your Project URL and service_role (secret) key. Keep the service-role key private. Never put it in browser code or share it in chat.

2) DEPLOY THE SITE (NETLIFY)
----------------------------
1. Create a free account at https://www.netlify.com/.
2. Deploy this folder using Netlify's manual deploy/drag-and-drop flow if available, or connect a Git repository containing these files.
3. Netlify will assign a public URL ending in .netlify.app. No paid domain is required.
4. In Netlify site configuration, add these environment variables:
   SUPABASE_URL = your Supabase Project URL
   SUPABASE_SERVICE_ROLE_KEY = your Supabase service_role/secret key
   ADMIN_SECRET = a long, unique password for your private admin page
5. Redeploy after setting the variables.

3) RECORD VERIFIED SALES
------------------------
Open your published site and check the counter. Open /admin.html to record a sale after you verify it is COMPLETED in PayPal Activity. Enter the PayPal transaction ID and ADMIN_SECRET. Duplicate transaction IDs are rejected.

IMPORTANT: This starter uses MANUAL payment verification. It does not automatically receive PayPal payment notifications. Do not record a pending, failed, refunded, or reversed transaction as a completed purchase. Reconcile a refund/reversal in the database so the public total remains accurate.

4) SET THE PAYPAL RETURN URL
----------------------------
After deployment, your return URL will be:
https://YOUR-SITE-NAME.netlify.app/thank-you.html
In your PayPal payment link editor, look under Confirmation for Auto-return and paste this URL. PayPal's guide: https://developer.paypal.com/payment-links-buttons/create-payment-link/

The thank-you page is not proof of payment. The counter increases only when you record a transaction after confirming it in PayPal Activity.

CERTIFICATE DELIVERY
--------------------
This starter does not automatically email certificates. Email the certificate to the buyer's checkout email only after PayPal shows the payment as completed.

SECURITY
--------
Never share your PayPal password, Supabase service-role key, or Netlify environment variables. Keep admin.html unadvertised and use a long random ADMIN_SECRET. Do not paste secrets into chat.
