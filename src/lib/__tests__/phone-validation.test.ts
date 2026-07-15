import {validatePhoneNumber} from "../phone-validation";

describe("validatePhoneNumber", () => {
  it("rejects empty input", () => {
    expect(validatePhoneNumber("").ok).toBe(false);
  });

  it("accepts US 10-digit numbers", () => {
    const result = validatePhoneNumber("4155552671");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe("+14155552671");
  });

  it("accepts formatted US numbers", () => {
    const result = validatePhoneNumber("(415) 555-2671");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe("+14155552671");
  });

  it("accepts US numbers with +1", () => {
    const result = validatePhoneNumber("+1 415 555 2671");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe("+14155552671");
  });

  it("rejects invalid US area codes", () => {
    expect(validatePhoneNumber("0155552671").ok).toBe(false);
  });

  it("accepts international E.164", () => {
    const result = validatePhoneNumber("+442079460958");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe("+442079460958");
  });

  it("rejects international numbers that are too short", () => {
    expect(validatePhoneNumber("+441234").ok).toBe(false);
  });
});
