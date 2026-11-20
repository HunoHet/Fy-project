# Supabase setup

The app requires a signed-in Supabase user and uses Supabase for profiles, follows, direct messages, posts, and reels. Without Supabase credentials it shows the sign-in screen rather than generated demo accounts.

## 1. Create the project and database

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor**, create a query, paste in [`supabase/schema.sql`](./supabase/schema.sql), and run it.
3. This creates `profiles`, private `user_interests`, `follows`, `messages`, `message_reactions`, `notifications`, `posts`, persistent `post_comments`, and `post_comment_likes`; adds row-level security policies; creates a profile when an Auth user is created; and enables Realtime for messages, reactions, notifications, follows, and posts. Comments support replies, likes, and author-only deletion. Messages support quick reactions, sender deletion, and editing only until read. Like and unfollow notifications are created by database triggers and are visible only to their recipient. Existing profile interests are migrated into the private table and cleared from public profiles. Public sync-point totals are stored on profiles.
4. The SQL also creates the public `social-media` Storage bucket. Uploads are limited to 100 MB, and authenticated users can upload/delete only files inside their own user-ID folder. Signed-in users can discover posts and reels from all creators; personal likes and In-Feed selections are stored privately and used to rank hashtag-matched reels.
5. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy `anon` key). Do not put the `service_role` key in this browser app.

## 2. Configure the local app

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` to the Project URL and `VITE_SUPABASE_ANON_KEY` to the publishable/anon key.
3. Restart the Vite dev server after changing environment variables.
4. Add the deployed site URL to **Authentication → URL Configuration → Site URL**. Add local development URLs (for example `http://localhost:5173` and `http://127.0.0.1:5173`) to **Redirect URLs**.

## 3. Upload posts and reels

The profile composer supports image posts and video reels, captions, and searchable hashtags from the 200 topics in the app. Posts require one hashtag; reels require at least one and allow up to nine. Users can search and select up to 50 interests from the same topic list during onboarding or profile editing. Interests are stored privately and only affect that user's recommendations; only the account owner can read them. Feed and Reels prioritize public content hashtags that match the signed-in user's private interests, without exposing anyone else's private interest list.

Run the complete `supabase/schema.sql` after setting up the project and whenever it changes. It provisions the Storage bucket, policies, feedback table, and database tables; no manual table or bucket creation is required. Reels are drawn from all creators, with likes and In-Feed selections on reels and Feed posts used to rank hashtag-matched videos.

## 4. Enable registration email confirmation

1. In **Authentication → Providers → Email**, enable the Email provider.
2. Enable **Confirm email** in the email provider settings. Registration uses `signUp` with the user's email and password, then requires `verifyOtp` with `type: 'signup'` before the account is confirmed. Registration also supplies the display name and username as Auth user metadata.
3. Configure the confirmation email template to render `{{ .Token }}` (for example: `Your confirmation code is {{ .Token }}`) so the email contains the six-digit code. The app does not send an email during password sign-in.
4. Configure SMTP for reliable delivery and custom sender details.

## 5. Enable Google sign-in

1. In Google Cloud Console, create an OAuth client ID for a Web application.
2. Add the Supabase callback URL shown by the Google provider setup page as an authorized redirect URI. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Copy the Google client ID and client secret into **Supabase → Authentication → Providers → Google**, then enable the provider.
4. Keep the Supabase callback as the provider redirect URI. The app passes its current origin as the post-login redirect; allow that origin in Supabase URL Configuration.

## 6. Enable Facebook sign-in

1. Create/configure a Facebook app in Meta for Developers and add the Facebook Login product.
2. Add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to Facebook's valid OAuth redirect URIs.
3. Copy the Facebook app ID and app secret into **Supabase → Authentication → Providers → Facebook**, then enable the provider.
4. Set the Facebook app to Live when ready for external users. Meta may require privacy policy, app domain, and review/verification details.

## 7. Verify real-time chat, content, and read receipts

1. Sign up two different accounts and confirm them if email confirmation is enabled.
2. Open the app in two separate browser profiles/devices and sign in as each account.
3. Search for the other username in Feed, follow it, and select **Message**.
4. Send a message. The other signed-in client should receive it without refreshing. Test reactions on messages from either account, delete a message you sent, and verify that an unread message can be edited but a read message cannot.
5. Like one of the other account's posts or reels, then unfollow that account. The recipient should see both events under **Notifications**; the top-left selector switches back to **Messages**.
6. Leave the receiving conversation closed: the sender should not see **Seen**. Open that conversation on the receiving client: incoming messages are marked read and the sender sees **Seen** in real time.

Read receipts are based on the recipient actually having that conversation open in **Messages**, selected from the Notifications tab's top-left selector. The browser only uses the publishable/anon key; row-level security in `schema.sql` prevents users from reading other people's messages or sending as another account.
