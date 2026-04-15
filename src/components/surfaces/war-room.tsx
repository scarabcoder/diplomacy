import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

export function WarRoomStage({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <div className={cn('war-room-stage', className)}>{children}</div>;
}

export function ParchmentPanel({
  children,
  className,
  as: Comp = 'section',
  style,
}: Readonly<{
  children: ReactNode;
  className?: string;
  as?: ElementType;
  style?: CSSProperties;
}>) {
  return <Comp className={cn('parchment-panel', className)} style={style}>{children}</Comp>;
}

export function CommandPanel({
  children,
  className,
  style,
}: Readonly<{
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}>) {
  return (
    <section className={cn('command-panel', className)} style={style}>{children}</section>
  );
}

export function SectionKicker({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <div className={cn('section-kicker', className)}>{children}</div>;
}

const statusSealToneClasses = {
  neutral: 'bg-[oklch(0.9_0.02_82)] text-[oklch(0.33_0.03_52)]',
  success: 'bg-[oklch(0.9_0.05_145)] text-[oklch(0.4_0.08_145)]',
  warning: 'bg-[oklch(0.93_0.06_82)] text-[oklch(0.46_0.09_72)]',
  danger: 'bg-[oklch(0.9_0.05_30)] text-[oklch(0.45_0.13_28)]',
  info: 'bg-[oklch(0.9_0.04_248)] text-[oklch(0.41_0.09_248)]',
  dark: 'bg-[oklch(0.28_0.03_248)] text-[oklch(0.94_0.01_85)]',
} as const;

export function StatusSeal({
  children,
  className,
  tone = 'neutral',
  ...props
}: Readonly<
  {
    children: ReactNode;
    className?: string;
    tone?: keyof typeof statusSealToneClasses;
  } & HTMLAttributes<HTMLSpanElement>
>) {
  return (
    <span
      className={cn('status-seal', statusSealToneClasses[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function InviteCode({
  code,
  className,
}: Readonly<{
  code: string;
  className?: string;
}>) {
  return <span className={cn('invite-code-chip', className)}>{code}</span>;
}
