# 12 — Legal and Privacy

> **Status: drafts, not legal advice.** These texts were written to guide
> development. Have a qualified lawyer review them before a public release,
> and before any store listing, which adds its own policy requirements.

## 1. Where the project stands legally

The local-first design (D5) removes most obligations at the source:

| Question | Answer |
| --- | --- |
| Does the project collect personal data? | No. There is no server, account, analytics, or crash reporting. Maintainers never receive user data. |
| Where is health data stored? | Only on the user's device, in the app's private storage. |
| Who receives meal photos? | The AI provider the user configured, under the user's own account and that provider's terms. With a local model, no one. |
| Who is responsible for that transfer? | The user chooses the provider and holds the account. The app must make the transfer clear before it happens (section 4). |

Data about health is a special category under the GDPR (Article 9) and
Spain's LOPDGDD, and sensitive data under Argentina's Law 25.326. Because
the project does not process such data on its own systems, its main duties
are **transparency** (tell users exactly what leaves the device and where it
goes) and **security by design** (protect what is stored locally). If the
project ever operates a service that receives user data, this analysis no
longer holds and must be redone.

## 2. Health disclaimer

Shown at first launch (FR-02) and always available under Settings → About.
Acceptance is recorded with the text version, and the user is asked again
when the text changes.

**English**

> **This app is not medical advice**
>
> Qbit Nutrition is a tool for keeping a personal food log. It is not a
> medical device and does not diagnose, treat, or prevent any condition.
>
> - **Values are estimates.** Calories and nutrients calculated from a photo
>   are approximations produced with the help of an AI model you chose. They
>   can be wrong, sometimes by a lot. Do not rely on them for medical
>   decisions, such as insulin dosing or managing an allergy.
> - **Targets are general guidance.** Suggested calorie and nutrient targets
>   come from standard formulas for healthy adults. They do not take your
>   medical history into account.
> - **Talk to a professional.** Consult a doctor or a registered dietitian
>   before changing your diet, especially if you are pregnant or
>   breastfeeding, under 18, have a medical condition, or have or have had
>   an eating disorder.
> - **The app cannot detect allergens.** Never use it to decide whether a
>   food is safe for you.
>
> If tracking food causes you distress, stop using the app and seek support
> from a health professional.

**Español**

> **Esta aplicación no es un consejo médico**
>
> Qbit Nutrition es una herramienta para llevar un registro personal de
> comidas. No es un producto sanitario y no diagnostica, trata ni previene
> ninguna enfermedad.
>
> - **Los valores son estimaciones.** Las calorías y los nutrientes
>   calculados a partir de una foto son aproximaciones obtenidas con la
>   ayuda de un modelo de IA que tú elegiste. Pueden ser incorrectos, a
>   veces por mucho. No los uses para tomar decisiones médicas, como
>   calcular dosis de insulina o controlar una alergia.
> - **Los objetivos son orientativos.** Los objetivos sugeridos de calorías
>   y nutrientes provienen de fórmulas estándar para adultos sanos. No
>   tienen en cuenta tu historial médico.
> - **Consulta a un profesional.** Habla con un médico o un nutricionista
>   titulado antes de cambiar tu alimentación, en especial si estás
>   embarazada o en período de lactancia, si eres menor de 18 años, si
>   tienes una enfermedad o si tienes o has tenido un trastorno de la
>   conducta alimentaria.
> - **La aplicación no detecta alérgenos.** Nunca la uses para decidir si un
>   alimento es seguro para ti.
>
> Si registrar tus comidas te genera malestar, deja de usar la aplicación y
> busca apoyo de un profesional de la salud.

### Related product rules

- No target proposals for users under 18 or who indicate pregnancy or
  breastfeeding (FR-14).
- No proposals below the safety floor.
- No wording that moralizes food or weight (document 05, section 8).
- The app makes no health claims in its description or screenshots.

## 3. Privacy policy (draft)

Published in the repository and shown in the app. A Spanish translation
ships with it.

> **Privacy policy — Qbit Nutrition**
>
> *Last updated: [date]*
>
> **Summary.** Your data stays on your device. We, the maintainers, do not
> collect, receive, or store any of it.
>
> **What the app stores on your device.** Your profile (if you fill it in),
> goals, meals, nutrient values, body measurements, meal photos (if you
> keep them), and your AI provider settings. API keys are stored in your
> device's secure storage.
>
> **What leaves your device, and only when you trigger it.**
>
> | Action | Data sent | Recipient |
> | --- | --- | --- |
> | Analyze a meal photo | The photo (reduced in size, without location metadata), your optional hint, your language | The AI provider you configured |
> | Ask for food suggestions | Remaining calories and nutrients for the day, your goal, your language | The AI provider you configured |
> | Scan a barcode | The barcode number | Open Food Facts |
> | Export | A file with your data | Wherever you send it |
>
> Your AI provider processes what you send under its own terms and privacy
> policy, which you accepted when you created your account with it. Some
> providers use content sent on free plans to improve their products. Check
> your provider's terms. If you use a model running on your own computer,
> nothing is sent to a third party.
>
> **What the app never does.** No accounts, no analytics, no advertising, no
> crash reports, no tracking, no selling or sharing of data.
>
> **Health platforms.** If you turn on Health Connect, the app writes your
> nutrition records to it and reads your weight from it, on your device,
> with the permissions you grant. You can revoke them at any time in system
> settings.
>
> **Your control.** You can export all your data, delete it all from
> Settings → Data, or uninstall the app, which removes everything it stored.
>
> **Children.** The app is intended for adults.
>
> **Changes.** Changes to this policy are published in the project
> repository with the release that introduces them.
>
> **Contact.** [project issue tracker or contact address]

## 4. In-app transparency requirements

| Moment | What the user must see |
| --- | --- |
| Choosing a provider preset | A cost note and a data-use note for that provider, with a link to its terms and the date the note was last verified |
| Before the first scan with a provider | A one-time notice: "This photo will be sent to [provider]", with "Do not show again" |
| Turning on Health Connect | A rationale screen listing each data type and why it is used |
| The first barcode lookup | A one-time notice that the barcode number is sent to Open Food Facts |
| The first request for AI suggestions with a provider | A one-time notice showing the numbers that are sent |
| Export | A reminder that the file contains health data and is not encrypted |
| About screen | Disclaimer, privacy policy, licenses, and data sources |

## 5. Privacy and security measures

| Measure | Reference |
| --- | --- |
| Data minimization: profile fields are optional; scans send no profile or history | FR-03, document 07 section 8 |
| Photo metadata, including location, is removed before upload | Document 07 section 2 |
| API keys in hardware-backed storage, excluded from exports and logs | NFR-04 |
| HTTPS required outside the local network | Document 06 section 6 |
| App data excluded from automatic cloud backup | Document 06 section 6 |
| Full export and full deletion | FR-70, FR-72 |
| No third-party tracking or analytics code | NFR-03 |

## 6. Rights of the user under data-protection law

Rights of access, portability, and erasure are satisfied by the app itself:
the data is on the user's device, and export and deletion are built in.
Requests about data held by an AI provider go to that provider.

## 7. Licenses and attributions

### The project

- **Code:** MIT (D7). A `LICENSE` file at the repository root names the
  copyright holder (open question Q5).
- **Documentation and prompts:** same license as the code unless stated.

### Third-party data

| Source | License | Obligations | How the project complies |
| --- | --- | --- | --- |
| USDA FoodData Central | Public domain (CC0 1.0) | None required; USDA asks to be cited as the source | Citation in the About screen and README |
| Open Food Facts | Open Database License; contents under the Database Contents License; images under CC BY-SA | Attribution; share-alike applies to databases derived from it | Attribution in the About screen. The database is **not bundled or redistributed**: products are fetched on demand and cached on the user's device. Product images are not used. |
| Community food-name translations | Contributed under the project license | — | Contribution guide states this |

Bundling any other data set (for example a national food table) requires
confirming first that its license permits redistribution inside an MIT
project. Share-alike or non-commercial data must not be merged into the
bundled catalog.

**Suggested citation in the app:** "Food composition data: U.S. Department
of Agriculture, Agricultural Research Service. FoodData Central."

### Third-party software

- Dependencies must have licenses compatible with MIT distribution
  (MIT, BSD, Apache-2.0, ISC, and similar). Copyleft dependencies need a
  recorded decision.
- The About screen lists all dependency licenses, generated at build time.
- Fonts: Inter is under the SIL Open Font License.

### Names and trademarks

Provider names in presets (for example "OpenAI", "Anthropic", "Google
Gemini") are used only to identify compatible services. The app does not
use their logos and states that it is not affiliated with them.

## 8. Checklist before a public release

- [ ] Lawyer review of the disclaimer and privacy policy in both languages.
- [ ] Copyright holder and project name decided; `LICENSE` added.
- [ ] Privacy policy published at a stable URL.
- [ ] Every preset's cost and data-use note re-verified against the
      provider's current terms.
- [ ] About screen shows the disclaimer, policy, attributions, and licenses.
- [ ] Dependency license report reviewed.
- [ ] If publishing in a store: its health-app, data-safety, and content
      policies reviewed, and the listing's data declarations filled in
      consistently with this document.
- [ ] Android developer verification requirements checked (open question
      Q1).
