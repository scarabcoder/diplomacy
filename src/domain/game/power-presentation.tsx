import type { ReactNode } from 'react';
import type { Power } from '@/domain/game/engine/types.ts';
import { cn } from '@/lib/utils.ts';

const POWER_META: Record<
  Power,
  {
    label: string;
    flagLabel: string;
  }
> = {
  austria: {
    label: 'Austria',
    flagLabel:
      'Austria-Hungary representative ensign, commonly used from 1869 to 1918',
  },
  england: {
    label: 'England',
    flagLabel: "England flag with St George's Cross",
  },
  france: {
    label: 'France',
    flagLabel: 'French tricolor used by the Third Republic',
  },
  germany: {
    label: 'Germany',
    flagLabel: 'German Empire black-white-red tricolor',
  },
  italy: {
    label: 'Italy',
    flagLabel: 'Kingdom of Italy tricolor with the Savoy shield',
  },
  russia: {
    label: 'Russia',
    flagLabel: 'Russian Empire white-blue-red tricolor',
  },
  turkey: {
    label: 'Turkey',
    flagLabel: 'Ottoman Empire flag with crescent and star',
  },
};

export function getPowerLabel(power: Power): string {
  return POWER_META[power].label;
}

function FlagArt({ power }: { power: Power }) {
  if (power === 'england') {
    return (
      <>
        <rect width="28" height="20" fill="#FFFFFF" />
        <rect x="11" width="6" height="20" fill="#C8102E" />
        <rect y="7" width="28" height="6" fill="#C8102E" />
      </>
    );
  }

  if (power === 'france') {
    return (
      <>
        <rect width="9.34" height="20" fill="#0055A4" />
        <rect x="9.33" width="9.34" height="20" fill="#FFFFFF" />
        <rect x="18.66" width="9.34" height="20" fill="#EF4135" />
      </>
    );
  }

  if (power === 'germany') {
    return (
      <>
        <rect width="28" height="6.67" fill="#111111" />
        <rect y="6.67" width="28" height="6.67" fill="#FFFFFF" />
        <rect y="13.34" width="28" height="6.66" fill="#C8102E" />
      </>
    );
  }

  if (power === 'russia') {
    return (
      <>
        <rect width="28" height="6.67" fill="#FFFFFF" />
        <rect y="6.67" width="28" height="6.67" fill="#0039A6" />
        <rect y="13.34" width="28" height="6.66" fill="#D52B1E" />
      </>
    );
  }

  if (power === 'austria') {
    return (
      <>
        <rect width="14" height="20" fill="#FFFFFF" />
        <rect width="14" height="6.67" fill="#ED2939" />
        <rect y="13.34" width="14" height="6.66" fill="#ED2939" />
        <rect x="14" width="14" height="20" fill="#FFFFFF" />
        <rect x="14" width="14" height="6.67" fill="#CD2A3E" />
        <rect x="14" y="13.34" width="14" height="6.66" fill="#436F4D" />
        <rect x="13.5" width="1" height="20" fill="#B89C60" opacity="0.75" />
      </>
    );
  }

  if (power === 'italy') {
    return (
      <>
        <rect width="9.34" height="20" fill="#008C45" />
        <rect x="9.33" width="9.34" height="20" fill="#FFFFFF" />
        <rect x="18.66" width="9.34" height="20" fill="#CD212A" />
        <path
          d="M14 5.3C15.6 5.3 16.9 5.8 17.9 6.6V10.5C17.9 13 16.4 14.9 14 16C11.6 14.9 10.1 13 10.1 10.5V6.6C11.1 5.8 12.4 5.3 14 5.3Z"
          fill="#D52B1E"
          stroke="#123A7A"
          strokeWidth="0.8"
        />
        <path d="M12.8 6.3H15.2V14.6H12.8Z" fill="#FFFFFF" />
        <path d="M10.8 9.2H17.2V11.6H10.8Z" fill="#FFFFFF" />
        <path
          d="M11.2 5.4H16.8L16.1 4.1H15.1L14 2.7L12.9 4.1H11.9L11.2 5.4Z"
          fill="#C9A227"
        />
      </>
    );
  }

  return (
    <>
      <rect width="28" height="20" fill="#E30A17" />
      <circle cx="11.2" cy="10" r="5.1" fill="#FFFFFF" />
      <circle cx="12.7" cy="10" r="4.1" fill="#E30A17" />
      <polygon
        points="18.9,6.8 19.9,8.8 22.1,9.1 20.5,10.6 20.9,12.8 18.9,11.8 16.9,12.8 17.3,10.6 15.7,9.1 17.9,8.8"
        fill="#FFFFFF"
      />
    </>
  );
}

export function PowerFlag({
  power,
  className,
  decorative = true,
}: {
  power: Power;
  className?: string;
  decorative?: boolean;
}) {
  const label = POWER_META[power].flagLabel;

  return (
    <span
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      className={cn(
        'inline-flex h-[0.95em] w-[1.32em] shrink-0 overflow-hidden rounded-[0.24rem] border border-black/15 shadow-[0_0_0_1px_rgba(255,255,255,0.28)_inset]',
        className,
      )}
      role={decorative ? undefined : 'img'}
      title={label}
    >
      <svg
        className="h-full w-full"
        fill="none"
        viewBox="0 0 28 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <FlagArt power={power} />
      </svg>
    </span>
  );
}

export function PowerName({
  power,
  className,
  flagClassName,
  textClassName,
}: {
  power: Power;
  className?: string;
  flagClassName?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 align-middle',
        className,
      )}
    >
      <PowerFlag className={flagClassName} power={power} />
      <span className={cn('truncate', textClassName)}>
        {getPowerLabel(power)}
      </span>
    </span>
  );
}

export function joinInlineMeta(items: ReactNode[]): ReactNode[] {
  return items.flatMap((item, index) =>
    index === 0
      ? [item]
      : [
          <span
            key={`meta-divider-${index}`}
            aria-hidden="true"
            className="text-current/50"
          >
            {' '}
            ·{' '}
          </span>,
          item,
        ],
  );
}
