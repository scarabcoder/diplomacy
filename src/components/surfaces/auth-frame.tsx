import type { ReactNode } from 'react';
import {
  ParchmentPanel,
  SectionKicker,
} from '@/components/surfaces/war-room.tsx';

export function AuthFrame({
  kicker,
  title,
  description,
  aside,
  children,
}: Readonly<{
  kicker: string;
  title: string;
  description: string;
  aside: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-6 sm:px-6 lg:px-10">
      <ParchmentPanel className="w-full overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(18rem,0.72fr)]">
          <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7 lg:px-8 lg:py-9">
            <div className="space-y-3">
              <SectionKicker>{kicker}</SectionKicker>
              <div className="space-y-3">
                <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-[34rem] text-base leading-7 text-muted-foreground sm:text-lg">
                  {description}
                </p>
              </div>
            </div>
            {children}
          </div>
          <div className="border-t border-black/10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-navy)_13%,white_87%)_0%,color-mix(in_oklab,var(--paper-strong)_80%,var(--accent-brass)_20%)_100%)] px-5 py-6 sm:px-7 lg:border-l lg:border-t-0 lg:px-8 lg:py-9">
            {aside}
          </div>
        </div>
      </ParchmentPanel>
    </div>
  );
}
