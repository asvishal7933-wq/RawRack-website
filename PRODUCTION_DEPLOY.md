# RawRack production deployment

Vercel supports Express directly. The project includes a Vercel configuration and exports the Express app.

## Public URL
After deployment, Vercel gives the project a public `*.vercel.app` URL. A custom RawRack domain can then be connected in the Vercel Domains section.

## Steps
1. Create a Vercel account.
2. Put this project into a GitHub repository.
3. Import the repository into Vercel.
4. Add environment variables:
   - RAZORPAY_KEY_ID
   - RAZORPAY_KEY_SECRET
   - RAZORPAY_WEBHOOK_SECRET
   - ADMIN_KEY
   - PUBLIC_BASE_URL
5. Deploy.
6. Test the generated public URL on phone, tablet and desktop.
7. Connect your final domain and configure DNS.
8. Enable/verify HTTPS.
9. Add the production Razorpay webhook URL.
10. Switch Razorpay from Test Mode to Live Mode only after end-to-end testing.

## Production storage
The current build stores orders in `data/orders.json` and uploaded designs in `uploads/`. That is suitable for the prototype/local phase but should be replaced before public orders with:
- durable database (Postgres/Supabase/Neon/etc.)
- durable object storage (Vercel Blob/S3/Cloudinary/etc.)

## Security
Never put `RAZORPAY_KEY_SECRET`, webhook secret or ADMIN_KEY in frontend code or a public repository.
