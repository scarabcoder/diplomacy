import { createFormHook } from '@tanstack/react-form';
import {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
} from '@/lib/form-context.ts';
import { FormFieldErrors } from '@/lib/form/form-field-errors.tsx';
import { FormInput } from '@/lib/form/form-input.tsx';
import { FormSubmitButton } from '@/lib/form/form-submit-button.tsx';

export { useFieldContext, useFormContext };

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    FormInput,
    FormFieldErrors,
  },
  formComponents: {
    FormSubmitButton,
  },
  fieldContext,
  formContext,
});
