import { type ComponentProps } from 'react';
import { Label } from '@/components/ui/label.tsx';
import { useFieldContext } from '@/lib/form-context.ts';
import { cn } from '@/lib/utils.ts';

export const FormFieldErrors = ({
  className,
  ...props
}: ComponentProps<typeof Label>) => {
  const field = useFieldContext<unknown>();

  const { isTouched, isValid } = field.state.meta;

  const shouldShowError =
    isTouched ||
    (!field.form.state.canSubmit && field.form.state.submissionAttempts > 0);

  const isFieldInValid = !isValid && shouldShowError;

  const errors = field.state.meta.errors
    .map((error) => error.message)
    .join(', ');

  return (
    <Label
      htmlFor={field.name}
      className={cn(
        'text-destructive',
        {
          hidden: !errors || !isFieldInValid,
        },
        className,
      )}
      {...props}
    >
      {errors}
    </Label>
  );
};
