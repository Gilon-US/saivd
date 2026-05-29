"use client";

import {
  DEFAULT_QR_OVERLAY_POSITION,
  QR_OVERLAY_POSITION_LABELS,
  QR_OVERLAY_POSITIONS,
  type QrOverlayPosition,
} from "@/lib/presentation-qr/position";
import {cn} from "@/lib/utils";

type QrOverlayPositionPickerProps = {
  value: QrOverlayPosition;
  onChange: (value: QrOverlayPosition) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function QrOverlayPositionPicker({
  value,
  onChange,
  disabled = false,
  idPrefix = "qr-overlay",
}: QrOverlayPositionPickerProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium leading-none">QR overlay position</legend>
      <p className="text-xs text-muted-foreground">
        Where your presentation QR appears on watermarked videos and images.
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-md">
        {QR_OVERLAY_POSITIONS.map((position) => {
          const inputId = `${idPrefix}-${position}`;
          const selected = value === position;
          return (
            <label
              key={position}
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
                disabled && "cursor-not-allowed opacity-60",
              )}>
              <input
                id={inputId}
                type="radio"
                name={`${idPrefix}-position`}
                value={position}
                checked={selected}
                onChange={() => onChange(position)}
                className="h-4 w-4"
              />
              <span>{QR_OVERLAY_POSITION_LABELS[position]}</span>
            </label>
          );
        })}
      </div>
      {!QR_OVERLAY_POSITIONS.includes(value) && (
        <p className="text-xs text-muted-foreground">
          Using default: {QR_OVERLAY_POSITION_LABELS[DEFAULT_QR_OVERLAY_POSITION]}
        </p>
      )}
    </fieldset>
  );
}
