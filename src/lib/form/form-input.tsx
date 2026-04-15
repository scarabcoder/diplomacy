import * as React from 'react';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { useFieldContext } from '@/lib/form-context.ts';
import { cn } from '@/lib/utils.ts';
import { FormFieldErrors } from './form-field-errors';

type FormInputProps = {
  label?: string;
  inputClassName?: string;
} & React.ComponentProps<'input'>;

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    { label, type = 'text', className, inputClassName, maxLength, ...props },
    ref,
  ) => {
    const field = useFieldContext<string | number | null>();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'number') {
        const newVal = parseInt(e.target.value);
        field.handleChange(isNaN(newVal) ? null : newVal);
      } else {
        field.handleChange(e.target.value);
      }
    };

    return (
      <div className={cn(className, 'relative')}>
        {label && (
          <Label className="mb-2" htmlFor={field.name}>
            {label}
          </Label>
        )}
        <Input
          {...props}
          className={inputClassName}
          ref={ref}
          name={field.name}
          id={field.name}
          value={field.state.value || ''}
          onChange={handleChange}
          onBlur={field.handleBlur}
          type={type}
          maxLength={maxLength ?? 200}
        />
        <FormFieldErrors />
      </div>
    );
  },
);

FormInput.displayName = 'FormInput';
