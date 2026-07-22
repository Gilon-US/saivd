import {SETTING_DEFS, getSettingDefault, validateSettingValue} from "@/lib/app-settings";

describe("app-settings: min_image_size_kb", () => {
  it("is a recognized integer setting with a 50 KB default", () => {
    const def = SETTING_DEFS.find((d) => d.key === "min_image_size_kb");
    expect(def).toBeDefined();
    expect(def?.type).toBe("integer");
    expect(getSettingDefault("min_image_size_kb")).toBe("50");
  });

  it("accepts 0 (disables the minimum)", () => {
    expect(validateSettingValue("min_image_size_kb", "0")).toBeNull();
  });

  it("accepts a positive integer", () => {
    expect(validateSettingValue("min_image_size_kb", "50")).toBeNull();
    expect(validateSettingValue("min_image_size_kb", "250")).toBeNull();
  });

  it("rejects negative and non-numeric values", () => {
    expect(validateSettingValue("min_image_size_kb", "-1")).toMatch(/zero or a positive integer/);
    expect(validateSettingValue("min_image_size_kb", "abc")).toMatch(/zero or a positive integer/);
  });

  it("still rejects 0 for other integer settings (e.g. max_image_size_mb)", () => {
    expect(validateSettingValue("max_image_size_mb", "0")).toMatch(/positive integer/);
    expect(validateSettingValue("max_image_size_mb", "10")).toBeNull();
  });
});
