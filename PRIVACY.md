# Privacy policy — Qbit Nutrition

> **Draft, pending legal review.** This text has not been reviewed by a lawyer (see [docs/12-legal-and-privacy.md](docs/12-legal-and-privacy.md)). It describes what the app does today, and a Spanish translation ships inside the app.
>
> Last updated: 2026-11-21.

**Summary.** Your data stays on your device. We, the maintainers, do not collect, receive, or store any of it.

**What the app stores on your device.** Your profile (if you fill it in), goals, meals, nutrient values, body measurements, meal photos (if you keep them), and your AI provider settings. API keys are stored in your device's secure storage.

**What leaves your device, and only when you trigger it.**

| Action | Data sent | Recipient |
| --- | --- | --- |
| Analyze a meal photo | The photo (reduced in size, without location metadata), your optional hint, your language | The AI provider you configured |
| Ask for food suggestions | Remaining calories and nutrients for the day, your goal, your language | The AI provider you configured |
| Look up a barcode | The barcode number, and the app name, version and project address in the request header | Open Food Facts |
| Export | A file with your data | Wherever you send it |

Your AI provider processes what you send under its own terms and privacy policy, which you accepted when you created your account with it. Some providers use content sent on free plans to improve their products. Check your provider's terms. If you use a model running on your own computer, nothing is sent to a third party. Like any web service, the AI provider and Open Food Facts also see your network address when they receive a request.

**What the app never does.** No accounts, no analytics, no advertising, no crash reports, no tracking, no selling or sharing of data.

**Health platforms.** If you turn on Health Connect, the app writes each saved meal to it as a nutrition record (time, meal type, calories, nutrients and the meal's name) and reads your weight from it, on your device, with the permissions you grant. The two permissions are separate and you can decline either. Other apps that you allow in Health Connect can read what this app wrote. You can turn it off in the app and revoke the permissions in system settings at any time. Deleting all data in the app offers to remove the records it wrote.

**Your control.** You can export all your data, delete it all from Settings → Data, or uninstall the app, which removes everything it stored. Records already written to Health Connect belong to Health Connect: remove them with the option in Delete all data, or in Health Connect itself.

**Children.** The app is intended for adults.

**Changes.** Changes to this policy are published in the project repository with the release that introduces them.

**Contact.** Open an issue at https://github.com/qbitdevz/qbit-nutrition/issues.
