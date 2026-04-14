import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as z from 'zod/v4';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
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

  const { mutateAsync: signInMutation } = useMutation({
    mutationFn: signInEmail,
    onSuccess,
  });

  const { mutateAsync: guestMutation } = useMutation({
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Play as Guest</CardTitle>
          <CardDescription>
            Jump in with just a name
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guestForm.handleSubmit();
            }}
            className="space-y-4"
          >
            <guestForm.AppField name="name">
              {(field) => (
                <field.FormInput
                  autoComplete="name"
                  label="Name"
                  type="text"
                  placeholder="Your display name"
                  className="w-full"
                />
              )}
            </guestForm.AppField>

            <guestForm.AppForm>
              <guestForm.FormSubmitButton
                className="w-full"
                listenForIsDirty={false}
                listenForIsDefault={false}
              >
                Play as Guest
              </guestForm.FormSubmitButton>
            </guestForm.AppForm>
          </form>
        </CardContent>
      </Card>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            or sign in with an account
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your credentials to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loginForm.handleSubmit();
            }}
            className="space-y-4"
          >
            <loginForm.AppField name="email">
              {(field) => (
                <field.FormInput
                  autoComplete="email"
                  label="Email"
                  type="email"
                  className="w-full"
                />
              )}
            </loginForm.AppField>

            <loginForm.AppField name="password">
              {(field) => (
                <field.FormInput
                  autoComplete="current-password"
                  label="Password"
                  type="password"
                  className="w-full"
                />
              )}
            </loginForm.AppField>

            <loginForm.AppForm>
              <loginForm.FormSubmitButton
                className="w-full"
                listenForIsDirty={false}
                listenForIsDefault={false}
              >
                Sign in
              </loginForm.FormSubmitButton>
            </loginForm.AppForm>

            <Separator />

            <p className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                className="text-foreground underline underline-offset-3 hover:no-underline transition-colors"
                to="/register"
                search={{ redirect }}
              >
                Create one
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
