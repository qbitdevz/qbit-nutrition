# 09 — Interfaces and Integrations

The project has no server of its own (D5), so there are no first-party HTTP
endpoints. This document defines the two things that take their place:

1. **Internal contracts** between modules, which play the role an API would.
2. **External services** the app calls, and exactly what it sends to each.

Endpoint paths and headers of third-party services are listed as known at
the time of writing. Confirm each against the provider's current reference
when implementing its adapter.

## 1. Internal contracts

### 1.1 AI gateway (`core/ai`)

```ts
interface ProviderProfile {
  id: string;
  adapter: "openai_compatible" | "anthropic" | "gemini";
  baseUrl: string;
  model: string;
  outputMode?: "schema" | "tool" | "prompt";
  timeoutS: number;
}

interface VisionAdapter {
  analyzeMeal(input: {
    profile: ProviderProfile;
    apiKey: string | null;          // null for keyless local servers
    imageJpegBase64: string;
    hint?: string;
    locale: "en" | "es";
    signal: AbortSignal;            // cancel from the UI
  }): Promise<{
    result: ScanResult;             // validated; see document 07
    usage?: { inputTokens: number; outputTokens: number };
    latencyMs: number;
    repaired: boolean;
    outputModeUsed: "schema" | "tool" | "prompt";
  }>;

  listModels(profile: ProviderProfile, apiKey: string | null):
    Promise<string[] | null>;       // null when the provider has no listing

  testConnection(profile: ProviderProfile, apiKey: string | null):
    Promise<{ ok: true; outputMode: "schema" | "tool" | "prompt" }
          | { ok: false; error: ProviderError }>;

  suggestFoods(input: {             // FR-51; text only
    profile: ProviderProfile; apiKey: string | null;
    remaining: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    goal: string; locale: "en" | "es"; signal: AbortSignal;
  }): Promise<Suggestion[]>;
}
```

### 1.2 Provider error taxonomy

Every adapter maps its failures to one of these codes. The UI maps each
code to one message (document 04, flow C).

| Code | Typical cause |
| --- | --- |
| `no_network` | Request never reached a server |
| `timeout` | No answer within the profile's timeout |
| `auth_invalid` | HTTP 401 or 403 |
| `model_not_found` | Unknown model identifier |
| `no_vision` | Model rejects image input |
| `quota_exceeded` | HTTP 429, or a quota error body; carries `retryAfterS` when known |
| `provider_unavailable` | HTTP 5xx |
| `content_refused` | Safety refusal |
| `invalid_output` | Response failed schema validation after the repair retry |
| `insecure_url` | Plain HTTP to a non-private address |
| `unknown` | Anything else; carries a redacted detail string |

"No food detected" is a valid model answer, not a provider failure, so it is
reported separately from this taxonomy. A canceled request is reported as an
abort and is never retried.

### 1.3 Catalog (`core/catalog`)

```ts
interface Catalog {
  search(query: string, locale: "en" | "es", limit: number): Promise<FoodSummary[]>;
  match(items: DetectedItem[], locale: "en" | "es"): Promise<MatchResult[]>;
  getFood(ref: FoodRef): Promise<FoodDetail>;       // nutrients per 100 g, portions
  rememberCorrection(detectedName: string, ref: FoodRef): Promise<void>;
}

type FoodRef =
  | { source: "catalog"; id: string }
  | { source: "custom"; id: string }
  | { source: "barcode"; id: string };
```

### 1.4 Nutrition core (`core/nutrition`)

Pure functions, no I/O:

```ts
computeItemNutrients(food: FoodDetail, grams: number): NutrientAmounts
sumNutrients(items: NutrientAmounts[]): NutrientAmounts
proposeTargets(profile: ProfileInput, goal: GoalInput): TargetProposal | NoProposal
pickInsight(day: DayTotals, targets: Targets, recentDays: DayTotals[], now: Date): Insight | null
convert(value: number, from: Unit, to: Unit): number
```

### 1.5 Repositories (`data`)

One repository per aggregate: `MealRepository`, `GoalRepository`,
`MeasurementRepository`, `ProviderRepository`, `SettingsRepository`,
`ExportService`. Saving a meal with its items and snapshots is a single
transaction. Screens never run SQL directly.

## 2. External services

### 2.1 Summary

| Service | Purpose | Scope | Auth | Data sent |
| --- | --- | --- | --- | --- |
| User's AI provider | Photo analysis; text suggestions | MVP | User's key | Photo, hint, locale; or numeric totals |
| Open Food Facts | Product by barcode | MVP | None | The barcode |
| Health Connect | Share nutrition, read weight | MVP | Android permission | On-device only |
| USDA FoodData Central | Source of the bundled catalog | Build time only | Maintainer's key | Nothing from users |
| Apple HealthKit | Same as Health Connect, on iOS | Later | iOS permission | On-device only |

The app contacts no other host. There is no update check, telemetry, or
remote configuration.

### 2.2 OpenAI-compatible adapter

| | |
| --- | --- |
| Analyze | `POST {baseUrl}/chat/completions` |
| List models | `GET {baseUrl}/models` |
| Auth | `Authorization: Bearer {key}`; omitted when no key is set |
| Image | A message content part of type `image_url` carrying a `data:image/jpeg;base64,…` URL |
| Structured output | `response_format` with a JSON Schema (mode A), a single tool definition (mode B), or prompt only (mode C) |
| Usage | `usage.prompt_tokens`, `usage.completion_tokens` when present |

Servers differ in which of these they honor. That is the reason for the
probing in "test connection" (document 07, section 3).

### 2.3 Anthropic adapter

| | |
| --- | --- |
| Analyze | `POST {baseUrl}/v1/messages` |
| List models | `GET {baseUrl}/v1/models` |
| Auth | `x-api-key: {key}` plus the `anthropic-version` header |
| Image | A content block of type `image` with a base64 source |
| Structured output | Native structured output with a JSON Schema in the output configuration (mode A), or a single forced tool whose input schema is the output schema (mode B). The native mode accepts a reduced JSON Schema: numeric and length bounds are stripped before sending and enforced on the device. |
| Usage | `usage.input_tokens`, `usage.output_tokens` |

### 2.4 Gemini adapter

| | |
| --- | --- |
| Analyze | `POST {baseUrl}/v1beta/models/{model}:generateContent` |
| List models | `GET {baseUrl}/v1beta/models` |
| Auth | `x-goog-api-key: {key}` |
| Image | A part with `inline_data` (MIME type and base64 data) |
| Structured output | A JSON response MIME type with a JSON Schema in the generation configuration (`responseJsonSchema`). No tool mode is used. |
| Usage | `usageMetadata` token counts; thinking tokens count as output |
| Errors | An invalid key is reported as HTTP 400 with reason `API_KEY_INVALID`; the retry delay on 429 also arrives in the error body |

### 2.5 Rules common to all provider calls

- One request per scan; no streaming is needed.
- Keys travel only in headers, never in URLs.
- HTTPS is required unless the host is loopback or a private-network
  address.
- No request is retried on 4xx. One retry on 5xx or a network error.
- Requests are cancelable from the UI.

### 2.6 Open Food Facts

| | |
| --- | --- |
| Lookup | `GET https://world.openfoodfacts.org/api/v2/product/{barcode}` with a `fields` parameter limited to names, serving size, and nutriments |
| Identification | A `User-Agent` naming the app, its version, and a contact URL, as the service asks of API clients |
| Limits | 15 product reads per minute and 10 searches per minute, applied per user for mobile apps |
| Consequences | Barcode lookup only. **No search-as-you-type against the service**; text search stays on the local catalog. Every result is cached in `barcode_product`. |
| Data quality | Crowd-sourced and not guaranteed. A product with missing or implausible values is shown as incomplete and editable before saving. |
| License | ODbL: attribution in the About screen; see document 12 |

### 2.7 Health Connect

| | |
| --- | --- |
| Write | A nutrition record per saved meal: time, meal type, energy, macronutrients, and available micronutrients |
| Read | Weight records, imported into `body_measurement` with source `health_connect` |
| Permissions | Requested only when the user turns the integration on; write and read are separate grants |
| Edits and deletes | Each written record carries the meal id as its client record id, so editing or deleting a meal updates or removes its record |
| Policy | Health Connect requires a privacy policy and a rationale screen explaining the use of each data type |

As built: the binding is `react-native-health-connect`; a failed write never
blocks saving a meal and is retried later; weight is read for the last 30
days; the integration is off by default and its settings are never exported.

**Google Fit is not integrated.** Its APIs are supported only until the end
of 2026, and Health Connect is the replacement for mobile apps.

### 2.8 USDA FoodData Central (build time)

The app does not call this API at run time. The catalog build script uses
the bulk data downloads, or the API with the maintainer's key, which is
limited to 1,000 requests per hour. The key is a build secret and is never
shipped.

## 3. Sharing and files

| Interface | Direction | Format |
| --- | --- | --- |
| Export | Out, through the system share sheet | JSON or ZIP (document 08, section 9) |
| Import | In, through the system file picker | Same |
| CSV export (Next) | Out | One row per meal item |
| Share a photo into the app (Later) | In, through an Android share target | Image |

## 4. If a sync server is ever added (FR-76)

Not designed here. Constraints it must respect: optional, self-hosted,
end-to-end encrypted with a key that never leaves the user's devices, and
the app must remain fully usable without it.
