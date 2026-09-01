import { UnconfiguredEmailProvider } from "./providers/unconfigured.provider.js";
import type { EmailProvider } from "./types.js";

export function getEmailProvider(): EmailProvider {
  return new UnconfiguredEmailProvider();
}
