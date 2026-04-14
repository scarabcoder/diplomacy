# Email System

## Architecture

Transactional email via SendGrid with React Email templates. The `EmailService` singleton is the only way to send email.

## EmailService Class

The service lives in `src/common/email/email.service.ts`:

```typescript
export class EmailService {
  private sendgrid: typeof sgMail;
  private defaultFromEmail: string;
  private applicationName: string;
  private logoUrl: string;

  constructor(config: EmailServiceConfig) { ... }

  async sendEmail<TProps = {}>(params: SendEmailParams<TProps>): Promise<void> {
    const { to, template, props, from } = params;
    const baseProps = { logoUrl: this.logoUrl, applicationName: this.applicationName };
    const mergedProps = { ...props, ...baseProps };

    // Dynamic subject/preview
    const subject = typeof template.subject === 'function' ? template.subject(mergedProps) : template.subject;
    const preview = typeof template.preview === 'function' ? template.preview(mergedProps) : template.preview;

    // Render HTML + plaintext
    const emailComponent = createElement(ContainerTemplate, { preview, logoUrl, applicationName },
      createElement(template.component, { ...mergedProps, preview }));
    const [html, plainText] = await Promise.all([
      render(emailComponent),
      render(emailComponent, { plainText: true }),
    ]);

    await this.sendgrid.send({ to, from: fromAddress, subject, html, text: plainText });
  }
}

// Singleton
export const emailService = createEmailService({
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  defaultFromEmail: process.env.FROM_EMAIL || '',
  applicationName: process.env.APP_NAME || 'App',
  logoUrl: process.env.APP_LOGO_URL || '',
});
```

## Template Type

```typescript
export interface BaseTemplateProps {
  children?: ReactNode;
  logoUrl: string;
  applicationName: string;
  preview?: string;
}

export type EmailTemplate<TProps = {}> = {
  component: FC<TProps & BaseTemplateProps>;
  subject: ((props: TProps & BaseTemplateProps) => string) | string;
  preview: ((props: TProps & BaseTemplateProps) => string) | string;
};

export const createTemplate = <TProps>(template: EmailTemplate<TProps>): EmailTemplate<TProps> => template;
```

## Writing a New Template

Example -- OTP verification email:

```typescript
interface OTPTemplateProps {
  otp: string;
  expirationTime: number;
  applicationName: string;
}

const OTPTemplateComponent = ({ otp, expirationTime }: OTPTemplateProps) => (
  <>
    <Heading level={2}>Verify Your Email</Heading>
    <Paragraph>Your verification code is:</Paragraph>
    <Heading level={1} style={{ textAlign: 'center', letterSpacing: '0.3em' }}>{otp}</Heading>
    <Paragraph>This code expires in {expirationTime} minutes.</Paragraph>
  </>
);

export const OTPTemplate = createTemplate({
  component: OTPTemplateComponent,
  subject: ({ applicationName }) => `Your ${applicationName} verification code`,
  preview: 'Your email verification code',
});
```

## Container Template

Every email is wrapped in `ContainerTemplate` which provides consistent branding: logo, app name, footer. It is automatically applied by `EmailService.sendEmail()`.

## Reusable Components

Located in `src/common/email/components/`:

- `Heading` -- styled heading with level prop
- `Paragraph` -- body text
- `Button` -- CTA button with href
- `HorizontalRule` -- divider

## Connecting to Auth

BetterAuth plugins call `emailService.sendEmail()` in their hooks:

```typescript
emailOTP({
  async sendVerificationOTP({ email, otp }) {
    void emailService.sendEmail({
      to: email,
      template: OTPTemplate,
      props: { otp, applicationName: process.env.APP_NAME || 'App', expirationTime: 5 },
    });
  },
}),
```
