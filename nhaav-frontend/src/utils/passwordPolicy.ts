export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  key: 'length' | 'number' | 'special';
  label: string;
  met: boolean;
}

export const passwordRules = (password: string): PasswordRule[] => {
  const value = password || '';
  return [
    { key: 'length', label: 'At least 8 characters', met: value.length >= PASSWORD_MIN_LENGTH },
    { key: 'number', label: 'At least 1 number', met: /\d/.test(value) },
    {
      key: 'special',
      label: 'At least 1 special character',
      met: /[^A-Za-z0-9\s]/.test(value),
    },
  ];
};

export const isPasswordValid = (password: string): boolean =>
  passwordRules(password).every((rule) => rule.met);

/** First unmet rule, phrased for an inline form error. */
export const passwordPolicyError = (password: string): string | null => {
  const missing = passwordRules(password).find((rule) => !rule.met);
  if (!missing) return null;
  if (missing.key === 'length') return 'Password must be at least 8 characters long.';
  if (missing.key === 'number') return 'Password must contain at least one number.';
  return 'Password must contain at least one special character.';
};