# Set up a free AI provider: Google Gemini

This guide connects Qbit Nutrition to the free tier of the Google Gemini API, so you can scan meal photos without paying.
[Versión en español](gemini-free-tier.es.md).

> **Verified on 2026-11-21** against Google's own pages, linked in each step. Google changes limits, models and terms
> without notice: if something here differs from what you see, trust Google's page and
> [open an issue](https://github.com/qbitdevz/qbit-nutrition/issues). The app also shows a cost note and the date it was
> last checked when you pick a provider.

## Before you start

- You need a Google account and the app installed on your phone.
- **Do not set up billing.** The free tier does not need a payment method; a paid tier begins only when you link a billing
  account ([usage tiers](https://ai.google.dev/gemini-api/docs/rate-limits#usage-tiers)). Qbit Nutrition is built to cost
  nothing, so stay on the free tier.
- **Your meal photos go to Google.** On the free tier Google says the content you send is used to improve its products
  ([pricing](https://ai.google.dev/gemini-api/docs/pricing): "Content used to improve our products" under Free). Do not
  scan anything private, and keep faces and documents out of the frame. On the paid tier Google says it is not used,
  which is a reason some people pay; it is your choice and not required.

## 1. Get an API key

1. Open [Google AI Studio's API keys page](https://aistudio.google.com/apikey) and sign in.
2. Accept the terms if asked. A new user gets a default Google Cloud project and a key created for it
   ([API keys](https://ai.google.dev/gemini-api/docs/api-key)).
3. Create a key with **Create API key** if one was not made for you, and copy it. Keep it private: anyone with it can use
   your quota. If it leaks, delete it on the same page and make a new one.

If you use a Google Cloud project you already had, you may have to import it in AI Studio first and, for the free tier,
pass project verification; the key page says so.

## 2. Know the limits

- **Free tier:** limited access to certain models, with free input and output tokens. `gemini-3.5-flash-lite`, the
  model Qbit Nutrition suggests first, is listed as free of charge in the free tier
  ([pricing](https://ai.google.dev/gemini-api/docs/pricing)).
- **Rate limits** are counted in requests per minute, tokens per minute and requests per day, per project and per model.
  The numbers change, so Google does not print them in its docs: see yours at
  [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Daily limits reset at midnight Pacific time,
  and Google says the limits are not guaranteed ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)).
- One scan is one request. If you reach a limit the app says the quota is used up; wait, or add the food by search.

## 3. Add it in the app

1. On **Today**, open **Settings** (the sliders icon, top right), then **AI providers**, then **Add a provider**.
2. Choose **Google Gemini API**. Read the cost and data-use notes on the next screen.
3. Paste the key into **API key**. The key is stored in your phone's secure storage and is never shown again or included
   in an export.
4. Under **Model**, keep `gemini-3.5-flash-lite` or pick another suggestion. Check the model on Google's
   [pricing page](https://ai.google.dev/gemini-api/docs/pricing): not every model is in the free tier.
5. Press **Test connection**. It sends a small drawn plate, not your photos. Fix what it reports (a wrong key, a model
   name, no network), then press **Save provider**.
6. Your first provider becomes the active one. Before your first scan the app tells you where the photo will go; confirm.

## 4. If something goes wrong

| What you see | What to do |
| --- | --- |
| Invalid key | Copy the key again from AI Studio; check there are no spaces around it. |
| Quota or "too many requests" | You reached a limit of the free tier. Wait (daily limits reset at midnight Pacific time), try another suggested model, or log the meal by search. |
| The test fails but the key is right | Check that the phone has a network connection and that the model name is spelled exactly as on Google's pages. |

To stop using it, open the provider in **AI providers**, press **Remove saved key**, and delete the key in AI Studio too.
