import { ProviderError } from '../errors';
import type { HttpClient } from '../types';

export const TOOL_NAME = 'record_scan_result';
export const TOOL_DESCRIPTION = 'Record the foods detected in the meal photo and their estimated portions.';

export type Json = Record<string, any>;

/** Parses a 2xx body; anything that is not a JSON object is a malformed response. */
export function parseObject(bodyText: string, apiKey: string | null): Json {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw malformed('The response body is not JSON.', bodyText, apiKey);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw malformed('The response body is not a JSON object.', bodyText, apiKey);
  }
  return parsed as Json;
}

export function malformed(detail: string, raw: string, apiKey: string | null): ProviderError {
  return new ProviderError('unknown', {
    detail: `Malformed provider response: ${detail}`,
    rawResponse: raw, // ProviderError redacts first, then truncates
    secrets: [apiKey],
  });
}

export function unsupportedMode(adapter: string, mode: string): ProviderError {
  return new ProviderError('unknown', { detail: `The ${adapter} adapter does not support output mode "${mode}".` });
}

export function asTokens(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** `undefined` unless both counts are present. */
export function usageOf(input: unknown, output: unknown) {
  const i = asTokens(input);
  const o = asTokens(output);
  return i === undefined || o === undefined ? undefined : { inputTokens: i, outputTokens: o };
}

/**
 * Runs a GET against a listing endpoint. A provider without one (404 or 405)
 * yields `null`; every other failure, auth included, is an error.
 */
export async function getOrNull(
  http: HttpClient,
  options: Parameters<HttpClient['request']>[0],
): Promise<{ bodyText: string } | null> {
  try {
    const { bodyText } = await http.request(options);
    return { bodyText };
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
}

export function jsonHeaders(extra: Record<string, string>): Record<string, string> {
  return { 'content-type': 'application/json', accept: 'application/json', ...extra };
}
