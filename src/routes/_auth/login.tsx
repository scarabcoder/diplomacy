import type { ReactNode } from 'react';
import { ArrowRight, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as z from 'zod/v4';
import { AuthFrame } from '@/components/surfaces/auth-frame.tsx';
import {
  ParchmentPanel,
  SectionKicker,
  StatusSeal,
} from '@/components/surfaces/war-room.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { authClient } from '@/domain/auth/client.ts';
import { useAppForm } from '@/lib/form.ts';

const loginSchema = z.object({
  email: z.email('Please use a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const guestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

const fieldInputClassName =
  'h-13 rounded-[1.15rem] border-[color:color-mix(in_oklab,var(--accent-navy)_18%,var(--border)_82%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 text-[1.02rem] text-foreground placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--accent-brass)_58%,transparent)] focus-visible:ring-offset-0';

const actionButtonClassName =
  'h-12 rounded-full px-5 text-sm font-bold tracking-[0.14em] uppercase';

const signInEmail = async ({
  email,
  password,
}: z.infer<typeof loginSchema>) => {
  const { error, data: response } = await authClient.signIn.email({
    email,
    password,
  });
  if (error) throw new Error(error?.message);
  return response;
};

const signInGuest = async ({ name }: z.infer<typeof guestSchema>) => {
  const { error, data: response } = await authClient.signIn.anonymous();
  if (error) throw new Error(error?.message);
  const { error: updateError } = await authClient.updateUser({ name });
  if (updateError) throw new Error(updateError?.message);
  return response;
};

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { redirect } = Route.useSearch();

  const onSuccess = () => {
    queryClient.clear();
    localStorage.setItem('sessionChange', Date.now().toString());
    navigate({ to: redirect || '/', replace: true });
  };

  const {
    mutateAsync: signInMutation,
    isError: isLoginError,
    error: loginError,
  } = useMutation({
    mutationFn: signInEmail,
    onSuccess,
  });

  const {
    mutateAsync: guestMutation,
    isError: isGuestError,
    error: guestError,
  } = useMutation({
    mutationFn: signInGuest,
    onSuccess,
  });

  const loginForm = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      await signInMutation(value);
    },
  });

  const guestForm = useAppForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onSubmit: guestSchema,
    },
    onSubmit: async ({ value }) => {
      await guestMutation(value);
    },
  });

  return (
    <AuthFrame
      kicker="Sign In"
      title="Sign in."
      description="Sign in to return to your rooms, check the current board state, and submit orders."
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <SectionKicker className="text-[oklch(0.34_0.08_248)]">
              Notes
            </SectionKicker>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              Works on phone and desktop.
            </h2>
            <p className="text-base leading-7 text-[color:color-mix(in_oklab,var(--ink-soft)_92%,var(--accent-navy)_8%)]">
              Check room state quickly on your phone, or use desktop when you
              want more space for map review and order entry.
            </p>
          </div>

          <div className="space-y-3">
            <FeatureRow
              icon={<ShieldCheck className="size-4" />}
              title="Quick status"
              body="Open a room and see its current state without extra steps."
            />
            <FeatureRow
              icon={<Users className="size-4" />}
              title="Guest access"
              body="Join with a display name only when you do not need a saved account."
            />
            <FeatureRow
              icon={<UserRound className="size-4" />}
              title="Private orders"
              body="Each player keeps their own seat choice and submitted orders."
            />
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        <section className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-display text-2xl text-foreground">
                Account sign-in
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Use your saved account to reopen your rooms.
              </p>
            </div>
            <StatusSeal tone="dark">Sign in</StatusSeal>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              loginForm.handleSubmit();
            }}
          >
            <loginForm.AppField name="email">
              {(field) => (
                <field.FormInput
                  autoComplete="email"
                  inputClassName={fieldInputClassName}
                  label="Email address"
                  type="email"
                />
              )}
            </loginForm.AppField>

            <loginForm.AppField name="password">
              {(field) => (
                <field.FormInput
                  autoComplete="current-password"
                  inputClassName={fieldInputClassName}
                  label="Password"
                  type="password"
                />
              )}
            </loginForm.AppField>

            {isLoginError ? (
              <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
                {loginError.message}
              </p>
            ) : null}

            <loginForm.AppForm>
              <loginForm.FormSubmitButton
                className={`${actionButtonClassName} w-full`}
                listenForIsDefault={false}
                listenForIsDirty={false}
              >
                Sign in
                <ArrowRight className="size-4" />
              </loginForm.FormSubmitButton>
            </loginForm.AppForm>
          </form>
        </section>

        <div className="relative">
          <Separator className="bg-black/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-black/10 bg-[color:color-mix(in_oklab,var(--paper)_86%,white_14%)] px-3 py-1 text-[0.67rem] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Or continue as guest
            </span>
          </div>
        </div>

        <ParchmentPanel as="section" className="space-y-5 p-5">
          <div className="space-y-1">
            <h2 className="font-display text-xl text-foreground">
              Guest access
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Enter with a display name only. Useful for test rooms or informal
              games.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              guestForm.handleSubmit();
            }}
          >
            <guestForm.AppField name="name">
              {(field) => (
                <field.FormInput
                  autoComplete="name"
                  inputClassName={fieldInputClassName}
                  label="Display name"
                  placeholder="Nick Harris"
                  type="text"
                />
              )}
            </guestForm.AppField>

            {isGuestError ? (
              <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
                {guestError.message}
              </p>
            ) : null}

            <guestForm.AppForm>
              <guestForm.FormSubmitButton
                className={`${actionButtonClassName} w-full border border-[color:color-mix(in_oklab,var(--accent-navy)_18%,var(--border)_82%)] bg-[color:color-mix(in_oklab,var(--paper-strong)_74%,white_26%)] text-foreground hover:bg-[color:color-mix(in_oklab,var(--paper-strong)_64%,var(--accent-brass)_36%)]`}
                listenForIsDefault={false}
                listenForIsDirty={false}
                variant="secondary"
              >
                Join as guest
              </guestForm.FormSubmitButton>
            </guestForm.AppForm>
          </form>
        </ParchmentPanel>

        <p className="text-sm text-muted-foreground">
          New to the table?{' '}
          <Link
            className="font-semibold text-foreground underline decoration-[color:color-mix(in_oklab,var(--accent-brass)_72%,transparent)] underline-offset-4 transition hover:text-[color:var(--accent-oxblood)]"
            search={{ redirect }}
            to="/register"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthFrame>
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
