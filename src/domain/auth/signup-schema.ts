import * as z from 'zod/v4';

export const signupRequestSchema = z
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

export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

export const signupVerifySchema = z.object({
  email: z.email('Please enter a valid email address'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;
