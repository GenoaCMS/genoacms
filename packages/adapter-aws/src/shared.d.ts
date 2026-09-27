export interface AwsCredentials { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
export function unknownOptions (options: unknown, allowed: readonly string[]): string[]
export function requireString (options: unknown, key: string): string[]
/** `{ region }`, plus `credentials` when given; omitted means the SDK's default provider chain. */
export function clientConfig (region: string, credentials?: AwsCredentials): { region: string, credentials?: AwsCredentials }
