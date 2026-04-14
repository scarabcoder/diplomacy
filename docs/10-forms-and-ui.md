# Forms, UI Components, and Design System

## TanStack Form Setup

The form system is built on TanStack Form with a custom hook that pre-registers all field and form components, so every form in the app uses a single consistent API.

### Context Creation

`src/lib/form-context.ts` creates the shared context objects that bind field components to form state:

```typescript
import { createFormHookContexts } from '@tanstack/react-form';
export const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts();
```

### Hook Creation

`src/lib/form.ts` creates the app-wide form hook with all field and form components pre-registered:

```typescript
import { createFormHook } from '@tanstack/react-form';

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    FormInput, FormOTPInput, FormFieldErrors, FormSelect, FormTextarea, FormDatePicker,
  },
  formComponents: {
    FormSubmitButton,
  },
  fieldContext,
  formContext,
});
```

`createFormHook` produces a typed form hook where all registered components are automatically available on field and form instances. `useAppForm` is the single entry point for all forms in the app -- no direct imports of individual field components are needed.

---

## Field Components

Each field component calls `useFieldContext<T>()` internally to bind itself to the parent form's state. This means field components are never passed value/onChange props manually -- they read and write state through context.

### FormInput (simplified)

```typescript
export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, type = 'text', ...props }, ref) => {
    const field = useFieldContext<string | number | null>();
    return (
      <div>
        {label && <Label htmlFor={field.name}>{label}</Label>}
        <Input
          name={field.name}
          value={field.state.value || ''}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          type={type}
        />
        <FormFieldErrors />
      </div>
    );
  },
);
```

### Available Field Components

| Component | Purpose |
|---|---|
| `FormInput` | Text, number, email, and other standard input types |
| `FormTextarea` | Multi-line text input |
| `FormSelect` | Dropdown select with an options array |
| `FormDatePicker` | Date picker (native input on mobile, calendar popover on desktop) |
| `FormOTPInput` | OTP code input for verification flows |
| `FormFieldErrors` | Inline validation error display (used inside other field components) |
| `FormSubmitButton` | Submit button with automatic loading/disabled state |

---

## Form Usage Pattern

Forms follow a consistent three-step pattern: create the form with `useAppForm`, render fields via `form.Field`, and use the registered components directly on the field instance.

```typescript
const form = useAppForm({
  defaultValues: { title: '', description: '', priority: 'medium' },
  validators: { onChange: createTaskSchema },
  onSubmit: async ({ value }) => {
    await client.task.createTask(value);
  },
});

return (
  <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
    <form.Field name="title" children={(field) => <field.FormInput label="Title" />} />
    <form.Field name="description" children={(field) => <field.FormTextarea label="Description" />} />
    <form.Field name="priority" children={(field) => (
      <field.FormSelect label="Priority" options={[
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ]} />
    )} />
    <form.FormSubmitButton>Create</form.FormSubmitButton>
  </form>
);
```

Key points:

- `defaultValues` sets the initial form state and infers field types.
- `validators.onChange` accepts a Zod schema for real-time validation.
- `onSubmit` receives the validated form values.
- Each `form.Field` renders its children with the field instance, which carries the registered components (`FormInput`, `FormSelect`, etc.) as properties.
- `form.FormSubmitButton` is available directly on the form instance because it was registered as a form component.

---

## shadcn/ui Configuration

The project uses shadcn/ui for its component library. Configuration lives in `components.json` at the project root:

```json
{
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "css": "src/styles/app.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

Notable settings:

- **`style: "base-nova"`** -- Uses Base UI (`@base-ui/react`) primitives instead of Radix UI. This is the newer shadcn style variant.
- **`rsc: false`** -- TanStack Start does not use React Server Components, so RSC-specific patterns are disabled.
- **`iconLibrary: "lucide"`** -- Lucide React is the icon set.

### Adding Components

```bash
bun run shadcn add button
bun run shadcn add dialog
```

Components are installed into `src/components/ui/` and can be customized after installation.

---

## Tailwind CSS v4

The project uses Tailwind CSS v4, which moves configuration from JavaScript into CSS. The main stylesheet is `src/styles/app.css`:

```css
@import '@fontsource-variable/ysabeau-office';
@import '@fontsource/patrick-hand';
@import 'tailwindcss' source('../');
@import 'tw-animate-css';
@import "shadcn/tailwind.css";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  /* ... more custom properties */
}
```

### Key Differences from Tailwind v3

| Tailwind v3 | Tailwind v4 |
|---|---|
| `tailwind.config.js` for theme/plugins | `@theme inline { }` block in CSS |
| `require('@tailwindcss/typography')` in config | `@plugin "@tailwindcss/typography"` in CSS |
| `content: ['./src/**/*.tsx']` in config | `@import 'tailwindcss' source('../')` in CSS |
| Dark mode via config option | `@custom-variant dark (&:is(.dark *))` in CSS |

There is no `tailwind.config.js` file. All configuration lives in CSS.

---

## Color System

Colors use the OKLCH color space for perceptually uniform results across the palette:

```css
:root {
  --radius: 0.625rem;
  --background: oklch(0.972 0.006 80);
  --foreground: oklch(0.20 0.02 55);
  --primary: oklch(0.30 0.05 50);
  /* ... */
}
```

### Semantic Status Tokens

The design system defines semantic color tokens for status indicators:

| Token | Meaning | Palette |
|---|---|---|
| `--color-st-success` | Positive/complete | Sage green |
| `--color-st-warning` | Caution/at-risk | Honey amber |
| `--color-st-danger` | Error/destructive | Terracotta |
| `--color-st-info` | Informational | Muted warm slate |
| `--color-st-neutral` | Default/inactive | Warm gray |

These tokens are used consistently across badges, alerts, status indicators, and other UI elements that communicate state.

---

## Component Pattern -- CVA

Components use Class Variance Authority (CVA) for variant-based styling. This provides type-safe variant props with consistent class composition.

### Button Example

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all ...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline: "border-border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-7 gap-1 px-2.5",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

The `buttonVariants` function generates the correct class string for any combination of `variant` and `size`. Components export their variants function so other components can compose or extend them.

---

## Typography

The project uses two typefaces:

| Role | Font | Type |
|---|---|---|
| Body text | Ysabeau Office | Variable font (weight axis) |
| Accent/display | Patrick Hand | Static font |

Both are loaded via `@fontsource` packages and imported at the top of `src/styles/app.css`:

```css
@import '@fontsource-variable/ysabeau-office';
@import '@fontsource/patrick-hand';
```

This approach bundles the font files with the application rather than loading them from an external CDN, ensuring consistent loading behavior and no layout shift from font swaps.
