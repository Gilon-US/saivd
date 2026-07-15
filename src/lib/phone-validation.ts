export type PhoneValidationResult =
  | {ok: true; e164: string; display: string}
  | {ok: false; message: string};

/** Strip formatting characters for digit analysis. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidNanpTenDigits(digits: string): boolean {
  if (digits.length !== 10) return false;
  const areaFirst = digits[0];
  const exchangeFirst = digits[3];
  if (areaFirst === "0" || areaFirst === "1") return false;
  if (exchangeFirst === "0" || exchangeFirst === "1") return false;
  return true;
}

/**
 * Validate US or international phone format (no SMS verification).
 * US: 10-digit NANP or +1 + 10 digits.
 * International: E.164 +[country][number], 8–15 digits after +.
 */
export function validatePhoneNumber(raw: string): PhoneValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {ok: false, message: "Phone number is required"};
  }

  if (trimmed.startsWith("+")) {
    const e164Digits = trimmed.slice(1).replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(e164Digits)) {
      return {
        ok: false,
        message: "Enter a valid international number (e.g. +44 20 7946 0958)",
      };
    }
    const e164 = `+${e164Digits}`;
    return {ok: true, e164, display: formatE164Display(e164)};
  }

  const digits = digitsOnly(trimmed);

  if (digits.length === 10 && isValidNanpTenDigits(digits)) {
    const e164 = `+1${digits}`;
    return {ok: true, e164, display: formatNanpDisplay(digits)};
  }

  if (digits.length === 11 && digits.startsWith("1") && isValidNanpTenDigits(digits.slice(1))) {
    const e164 = `+${digits}`;
    return {ok: true, e164, display: formatNanpDisplay(digits.slice(1))};
  }

  return {
    ok: false,
    message: "Enter a valid US number (10 digits) or international +country code",
  };
}

function formatNanpDisplay(tenDigits: string): string {
  return `+1 (${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

function formatE164Display(e164: string): string {
  if (e164.startsWith("+1") && e164.length === 12) {
    return formatNanpDisplay(e164.slice(2));
  }
  return e164.replace(/(\+\d{1,3})(\d+)/, "$1 $2");
}
