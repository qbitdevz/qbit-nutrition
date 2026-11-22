import { DataError, type DataErrorCode } from '../errors';

/** Asserts that `promise` rejects with a `DataError` carrying `code`. */
export async function expectDataError(promise: Promise<unknown>, code: DataErrorCode): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e ?? new Error('rejected with nothing'),
  );
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe(code);
}
