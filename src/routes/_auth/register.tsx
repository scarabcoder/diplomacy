import type { ReactNode } from 'react';
import { BookOpenText, KeyRound, UserPlus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as z from 'zod/v4';
import { AuthFrame } from '@/components/surfaces/auth-frame.tsx';
import { SectionKicker, StatusSeal } from '@/components/surfaces/war-room.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { authClient } from '@/domain/auth/client.ts';
import { useAppForm } from '@/lib/form.ts';

const schema = z
  .object({
    name: z.string().min(2, 'Name is required'),
    email: z.email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const fieldInputClassName =
  'h-13 rounded-[1.15rem] border-[color:color-mix(in_oklab,var(--accent-navy)_18%,var(--border)_82%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 text-[1.02rem] text-foreground placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--accent-brass)_58%,transparent)] focus-visible:ring-offset-0';

const actionButtonClassName =
  'h-12 rounded-full px-5 text-sm font-bold tracking-[0.14em] uppercase';

const signup = async ({ name, email, password }: z.infer<typeof schema>) => {
  const { error, data: response } = await authClient.signUp.email({
    name,
    email,
    password,
  });
  if (error) throw new Error(error?.message);
  return response;
};

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { redirect } = Route.useSearch();

  const {
    mutateAsync: signUpMutation,
    isError,
    error,
  } = useMutation({
    mutationFn: signup,
    onSuccess: () => {
      queryClient.clear();
      localStorage.setItem('sessionChange', Date.now().toString());
      navigate({ to: redirect || '/', replace: true });
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      await signUpMutation(value);
    },
  });

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
            title="Simple sign-in"
            body="Email and password only. No extra setup is required."
          />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-2xl text-foreground">
              Create account
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Pick the name other players will see in each room.
            </p>
          </div>
          <StatusSeal tone="dark">Create account</StatusSeal>
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
              Create account
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
