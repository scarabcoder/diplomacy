import type { ReactNode } from 'react';
import { ArrowRight, ShieldCheck, UserRound } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as z from 'zod/v4';
import { AuthFrame } from '@/components/surfaces/auth-frame.tsx';
import { SectionKicker, StatusSeal } from '@/components/surfaces/war-room.tsx';
import { authClient } from '@/domain/auth/client.ts';
import { useAppForm } from '@/lib/form.ts';

const loginSchema = z.object({
  email: z.email('Please use a valid email address'),
  password: z.string().min(1, 'Password is required'),
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
