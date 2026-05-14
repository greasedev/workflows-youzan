export const AUTH_REQUIRED_MESSAGE = "auth-required";

export class AuthRequiredError extends Error {
  constructor() {
    super(AUTH_REQUIRED_MESSAGE);
    this.name = "AuthRequiredError";
  }
}

export function isAuthRequiredExtractData(extractData?: string): boolean {
  const rawExtractData = extractData?.trim();
  if (!rawExtractData) return false;

  let rawReportList: unknown;
  try {
    rawReportList = JSON.parse(rawExtractData);
  } catch {
    return false;
  }

  if (!Array.isArray(rawReportList)) return false;
  return String(rawReportList[0]).trim() === AUTH_REQUIRED_MESSAGE;
}
