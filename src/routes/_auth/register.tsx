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

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
});

const signup = async ({
  name,
  email,
  password,
}: z.infer<typeof schema>) => {
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

  const { mutateAsync: signUpMutation } = useMutation({
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
      if (value.password !== value.confirmPassword) {
        return;
      }
      await signUpMutation(value);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>
          Sign up to get started with Diplomacy
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.AppField name="name">
            {(field) => (
              <field.FormInput
                autoComplete="name"
                label="Name"
                type="text"
                className="w-full"
              />
            )}
          </form.AppField>

          <form.AppField name="email">
            {(field) => (
              <field.FormInput
                autoComplete="email"
                label="Email"
                type="email"
                className="w-full"
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => (
              <field.FormInput
                autoComplete="new-password"
                label="Password"
                type="password"
                className="w-full"
              />
            )}
          </form.AppField>

          <form.AppField
            name="confirmPassword"
            validators={{
              onChangeListenTo: ['password'],
              onChange: ({ value, fieldApi }) => {
                if (value && value !== fieldApi.form.getFieldValue('password')) {
                  return 'Passwords do not match';
                }
              },
            }}
          >
            {(field) => (
              <field.FormInput
                autoComplete="new-password"
                label="Confirm password"
                type="password"
                className="w-full"
              />
            )}
          </form.AppField>

          <form.AppForm>
            <form.FormSubmitButton
              className="w-full"
              listenForIsDirty={false}
              listenForIsDefault={false}
            >
              Create account
            </form.FormSubmitButton>
          </form.AppForm>

          <Separator />

          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link
              className="text-foreground underline underline-offset-3 hover:no-underline transition-colors"
              to="/login"
              search={{ redirect }}
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
