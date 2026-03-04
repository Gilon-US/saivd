# Frontend: User ID Decode Update (9-Digit Encoding)

The watermarking backend now encodes the numeric user ID as a **fixed 9-digit decimal string**, left-padded with zeros (e.g. `1` → `"000000001"`, `42` → `"000000042"`). The frontend must decode frame 0 to match this format.

---

## What to change

1. **Decode exactly 9 digits**  
   After you compute the right-side column sums from frame 0 and derive digit groups (see below), form the user ID from the **first 9 digit positions** only. Do not use a variable number of digits based on resolution or strip trailing zeros.

2. **Use dynamic `repsUsed`**  
   The number of repeated values per digit is:
   ```ts
   const repsUsed = Math.min(7, Math.floor(rightSide.length / 9));
   ```
   Take the first `9 * repsUsed` values of `rightSide` for decoding.

3. **Decode each digit by mode**  
   Split those values into 9 groups of size `repsUsed`. For each group, take the **mode** (most frequent value, 0–9). Those 9 values are the digits in order.

4. **Build the string and parse**  
   Concatenate the 9 digits into a string (e.g. `"000000001"`, `"000000042"`). Parse the numeric user ID as:
   ```ts
   const numericUserId = parseInt(digitStr, 10);
   ```
   **Do not strip trailing zeros.** Leading zeros are fine (`parseInt("000000001", 10) === 1`). Trailing zeros can be part of a valid ID.

---

## Summary

| Step | Action |
|------|--------|
| 1 | `repsUsed = Math.min(7, Math.floor(rightSide.length / 9))` |
| 2 | Take `rightSide.slice(0, 9 * repsUsed)` |
| 3 | Reshape into 9 groups of `repsUsed` values each |
| 4 | For each group, digit = mode (most frequent value 0–9) |
| 5 | `digitStr` = concatenation of the 9 digits |
| 6 | `numeric_user_id = parseInt(digitStr, 10)` — do not strip trailing zeros |

This matches the backend encoding in `watermark_video/utils.py` (`return_pattern_user_id_reps`) and extraction in `watermark_video/watermark_call_function.py` (`extract_user_id_from_y_channel`).
