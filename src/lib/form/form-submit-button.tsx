import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { useFormContext } from '@/lib/form-context.ts';

export const FormSubmitButton = ({
  listenForIsDirty = true,
  listenForIsDefault = true,
  ...props
}: React.ComponentProps<typeof Button> & {
  listenForIsDirty?: boolean;
  listenForIsDefault?: boolean;
}) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [
        state.isSubmitting,
        state.canSubmit,
        state.isDirty,
        state.isDefaultValue,
      ]}
    >
      {([isSubmitting, canSubmit, isDirty, isDefaultValue]) => (
        <Button
          disabled={
            isSubmitting ||
            !canSubmit ||
            (listenForIsDirty && !isDirty) ||
            (listenForIsDefault && isDefaultValue)
          }
          type="submit"
          {...props}
        >
          {props.children}
          {isSubmitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        </Button>
      )}
    </form.Subscribe>
  );
};
