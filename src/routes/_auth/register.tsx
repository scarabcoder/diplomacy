import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  KeyRound,
  MailCheck,
  UserPlus,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { usePostHog } from 'posthog-js/react';
import { triggerSessionChange } from '@/domain/auth/client.ts';
import {
  signupRequestSchema,
  type SignupRequestInput,
  signupVerifySchema,
} from '@/domain/auth/signup-schema.ts';
import { AuthFrame } from '@/components/surfaces/auth-frame.tsx';
import { SectionKicker, StatusSeal } from '@/components/surfaces/war-room.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { useAppForm } from '@/lib/form.ts';

const fieldInputClassName =
  'h-13 rounded-[1.15rem] border-[color:color-mix(in_oklab,var(--accent-navy)_18%,var(--border)_82%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 text-[1.02rem] text-foreground placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--accent-brass)_58%,transparent)] focus-visible:ring-offset-0';

const actionButtonClassName =
  'h-12 rounded-full px-5 text-sm font-bold tracking-[0.14em] uppercase';

type ApiError = { error?: string };

async function postJson(
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // ignore — handled below if !res.ok
  }

  if (!res.ok) {
    const message =
      (data as ApiError).error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const requestOtp = (input: SignupRequestInput) =>
  postJson('/api/auth/signup/request-otp', input);

const verifyOtp = (input: { email: string; otp: string }) =>
  postJson('/api/auth/signup/verify-otp', input);

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

type CollectedSignup = SignupRequestInput;

function RegisterPage() {
  const [step, setStep] = useState<'collect' | 'verify'>('collect');
  const [collected, setCollected] = useState<CollectedSignup | null>(null);

  return (
    <AuthFrame
      kicker="Create Account"
      title="Create an account."
      description="Create an account so your rooms, power choices, and results stay attached to the same player."
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <SectionKicker className="text-[oklch(0.34_0.08_248)]">
              Account Use
            </SectionKicker>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              Use one identity across rooms.
            </h2>
            <p className="text-base leading-7 text-[color:color-mix(in_oklab,var(--ink-soft)_92%,var(--accent-navy)_8%)]">
              Keep the same name, room membership, and ownership when you move
              between devices or come back later.
            </p>
          </div>

          <FeatureRow
            icon={<UserPlus className="size-4" />}
            title="Same name each time"
            body="Other players see the same display name whenever you come back."
          />
          <FeatureRow
            icon={<BookOpenText className="size-4" />}
            title="Rooms stay attached"
            body="Useful for longer games where players return over multiple sessions."
          />
          <FeatureRow
            icon={<KeyRound className="size-4" />}
            title="Email confirmation"
            body="We send a one-time code to your inbox before the account is created."
          />
        </div>
      }
    >
      {step === 'collect' ? (
        <CollectStep
          initialValues={collected}
          onContinue={(values) => {
            setCollected(values);
            setStep('verify');
          }}
        />
      ) : (
        <VerifyStep collected={collected!} onBack={() => setStep('collect')} />
      )}
    </AuthFrame>
  );
}

function CollectStep({
  initialValues,
  onContinue,
}: Readonly<{
  initialValues: CollectedSignup | null;
  onContinue: (values: CollectedSignup) => void;
}>) {
  const { redirect } = Route.useSearch();

  const { mutateAsync, isError, error } = useMutation({
    mutationFn: requestOtp,
  });

  const form = useAppForm({
    defaultValues: {
      name: initialValues?.name ?? '',
      email: initialValues?.email ?? '',
      password: initialValues?.password ?? '',
      confirmPassword: initialValues?.confirmPassword ?? '',
    },
    validators: {
      onSubmit: signupRequestSchema,
    },
    onSubmit: async ({ value }) => {
      await mutateAsync(value);
      onContinue(value);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl text-foreground">
            Create account
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We will email a one-time code to confirm your address before the
            account is created.
          </p>
        </div>
        <StatusSeal tone="dark">Step 1 of 2</StatusSeal>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.AppField name="name">
          {(field) => (
            <field.FormInput
              autoComplete="name"
              inputClassName={fieldInputClassName}
              label="Display name"
              type="text"
            />
          )}
        </form.AppField>

        <form.AppField name="email">
          {(field) => (
            <field.FormInput
              autoComplete="email"
              inputClassName={fieldInputClassName}
              label="Email address"
              type="email"
            />
          )}
        </form.AppField>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="password">
            {(field) => (
              <field.FormInput
                autoComplete="new-password"
                inputClassName={fieldInputClassName}
                label="Password"
                type="password"
              />
            )}
          </form.AppField>

          <form.AppField name="confirmPassword">
            {(field) => (
              <field.FormInput
                autoComplete="new-password"
                inputClassName={fieldInputClassName}
                label="Confirm password"
                type="password"
              />
            )}
          </form.AppField>
        </div>

        {isError ? (
          <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}

        <form.AppForm>
          <form.FormSubmitButton
            className={`${actionButtonClassName} w-full`}
            listenForIsDefault={false}
            listenForIsDirty={false}
          >
            Send confirmation code
          </form.FormSubmitButton>
        </form.AppForm>
      </form>

      <div className="relative">
        <Separator className="bg-black/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full border border-black/10 bg-[color:color-mix(in_oklab,var(--paper)_86%,white_14%)] px-3 py-1 text-[0.67rem] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            Already have an account?
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          className="font-semibold text-foreground underline decoration-[color:color-mix(in_oklab,var(--accent-brass)_72%,transparent)] underline-offset-4 transition hover:text-[color:var(--accent-oxblood)]"
          search={{ redirect }}
          to="/login"
        >
          Sign in instead
        </Link>
      </p>
    </div>
  );
}

function VerifyStep({
  collected,
  onBack,
}: Readonly<{
  collected: CollectedSignup;
  onBack: () => void;
}>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { redirect } = Route.useSearch();
  const posthog = usePostHog();

  const {
    mutateAsync: verify,
    isError,
    error,
  } = useMutation({
    mutationFn: verifyOtp,
    onSuccess: (data) => {
      const user = (data as { user?: { id?: string; name?: string; email?: string } })
        .user;
      if (user?.id) {
        posthog.identify(user.id, {
          email: user.email,
          name: user.name,
        });
      }
      posthog.capture('user_signed_up', { method: 'email' });
      queryClient.clear();
      triggerSessionChange();
      navigate({ to: redirect || '/', replace: true });
    },
    onError: (err) => {
      posthog.captureException(err);
    },
  });

  const {
    mutateAsync: resend,
    isPending: isResending,
    isSuccess: didResend,
    isError: isResendError,
    error: resendError,
    reset: resetResend,
  } = useMutation({
    mutationFn: requestOtp,
  });

  const form = useAppForm({
    defaultValues: { otp: '' },
    validators: {
      onSubmit: signupVerifySchema.pick({ otp: true }),
    },
    onSubmit: async ({ value }) => {
      await verify({ email: collected.email, otp: value.otp });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl text-foreground">
            Confirm your email
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We sent a 6-digit code to{' '}
            <span className="font-semibold text-foreground">
              {collected.email}
            </span>
            . Enter it below to finish creating your account.
          </p>
        </div>
        <StatusSeal tone="dark">Step 2 of 2</StatusSeal>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.AppField name="otp">
          {(field) => (
            <field.FormInput
              autoComplete="one-time-code"
              inputClassName={`${fieldInputClassName} text-center font-mono text-2xl tracking-[0.5em]`}
              inputMode="numeric"
              label="6-digit code"
              maxLength={6}
              placeholder="000000"
              type="text"
            />
          )}
        </form.AppField>

        {isError ? (
          <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}

        {isResendError ? (
          <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
            {resendError.message}
          </p>
        ) : null}

        {didResend ? (
          <p className="flex items-center gap-2 rounded-[1rem] bg-[color:color-mix(in_oklab,var(--paper-strong)_82%,white_18%)] px-4 py-3 text-sm text-muted-foreground">
            <MailCheck className="size-4" /> A new code is on its way.
          </p>
        ) : null}

        <form.AppForm>
          <form.FormSubmitButton
            className={`${actionButtonClassName} w-full`}
            listenForIsDefault={false}
            listenForIsDirty={false}
          >
            Verify and create account
          </form.FormSubmitButton>
        </form.AppForm>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          className="inline-flex items-center gap-1 font-semibold text-muted-foreground transition hover:text-foreground"
          onClick={() => {
            resetResend();
            onBack();
          }}
          type="button"
        >
          <ArrowLeft className="size-4" /> Use a different email
        </button>
        <button
          className="font-semibold text-foreground underline decoration-[color:color-mix(in_oklab,var(--accent-brass)_72%,transparent)] underline-offset-4 transition hover:text-[color:var(--accent-oxblood)] disabled:opacity-50"
          disabled={isResending}
          onClick={() => {
            resetResend();
            void resend(collected);
          }}
          type="button"
        >
          {isResending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  body,
}: Readonly<{
  icon: ReactNode;
  title: string;
  body: string;
}>) {
  return (
    <div className="rounded-[1.3rem] border border-black/10 bg-white/55 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-[color:var(--accent-navy)]">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_36%,white_64%)] text-[color:var(--accent-oxblood)]">
          {icon}
        </span>
        {title}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
