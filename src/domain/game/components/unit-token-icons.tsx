import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

export function TankTokenGlyph() {
  return (
    <>
      <rect
        x="3"
        y="13"
        width="14"
        height="4.5"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="7"
        y="9.2"
        width="6.5"
        height="3.8"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="13"
        y="10.4"
        width="7"
        height="1.4"
        rx="0.7"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="6.5" cy="18.7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18.7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="18.7" r="1.4" fill="currentColor" stroke="none" />
    </>
  );
}

export function BattleshipTokenGlyph() {
  return (
    <>
      <path
        d="M3 16h4.8l1.4-3.7h5l1.5 3.7h5.1l-2.8 4H5.7L3 16Z"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="7.6"
        y="13.1"
        width="8.4"
        height="1.6"
        rx="0.7"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="9.1"
        y="10.1"
        width="3.3"
        height="3"
        rx="0.7"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="12"
        y="10.8"
        width="5.2"
        height="1.1"
        rx="0.55"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="8"
        y="9"
        width="1.5"
        height="2.2"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
    </>
  );
}

function TokenSvg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-4', className)}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function TankTokenIcon({ className }: { className?: string }) {
  return (
    <TokenSvg className={className}>
      <TankTokenGlyph />
    </TokenSvg>
  );
}

export function BattleshipTokenIcon({ className }: { className?: string }) {
  return (
    <TokenSvg className={className}>
      <BattleshipTokenGlyph />
    </TokenSvg>
  );
}
