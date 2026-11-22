import { useCallback, useState } from 'react';
import { DeviceConflictError } from '../services/auth';

/**
 * Backend error details arrive in three shapes: a plain string, a structured
 * object (the rate limiter's 429 {code, category, message}) or — for a 422 — an
 * ARRAY of pydantic validation errors. All three are rendered as a human
 * message. The array case matters: without it a rejected field (a 6-character
 * password, an unknown role) fell through to the object branch and was
 * reported as "Too many requests. Please try again later.", which told the user
 * nothing about what to fix.
 */
const FIELD_LABELS: Record<string, string> = {
    email: 'Email',
    password: 'Password',
    role: 'Role',
    full_name: 'Full name',
    name: 'Name',
    phone: 'Phone',
    company: 'Company',
    designation: 'Designation',
    username: 'Username',
};

/** One readable sentence from FastAPI's 422 error list. */
const formatValidationErrors = (errors: any[]): string => {
    const described = errors
        .filter(e => e && typeof e === 'object')
        .map((e: any) => {
            const last = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : undefined;
            const label = typeof last === 'string' ? (FIELD_LABELS[last] ?? last) : '';
            let msg = typeof e.msg === 'string' ? e.msg.replace(/^Value error, /, '') : '';

            if (e.type === 'string_too_short') {
                msg = `must be at least ${e.ctx?.min_length ?? 1} characters`;
            } else if (e.type === 'string_too_long') {
                msg = `must be at most ${e.ctx?.max_length ?? 1} characters`;
            } else if (e.type === 'enum') {
                msg = last === 'role'
                    ? 'must be client, provider or supplier'
                    : `must be one of ${e.ctx?.expected ?? 'the supported values'}`;
            } else if (e.type === 'missing') {
                msg = 'is required';
            } else if (e.type === 'value_error') {
                // "value is not a valid email address: …" is pydantic's generic
                // wrapper; anything else is a sentence written by our own
                // validator (e.g. the admin-role refusal) and is kept verbatim.
                if (/valid email/i.test(msg)) {
                    msg = 'must be a valid email address';
                } else if (/^value is /i.test(msg)) {
                    msg = 'has an invalid value';
                }
            } else if (/^Input should be/i.test(msg)) {
                msg = 'has an unsupported value';
            }

            if (!msg) return label;
            if (!label) return msg;
            // Pydantic's generic wording starts lowercase ("String should…") and
            // needs the field name; a custom message is already a sentence.
            return /^[a-z]/.test(msg) ? `${label} ${msg}` : msg;
        })
        .filter(Boolean);

    if (!described.length) return '';
    const [first, ...rest] = described;
    return rest.length
        ? `${first} (and ${rest.length} more issue${rest.length > 1 ? 's' : ''})`
        : first;
};

export const formatAuthError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        const message = formatValidationErrors(detail);
        if (message) return message;
    }
    if (detail && typeof detail === 'object') {
        const retryAfter = Number(err?.response?.headers?.['retry-after']);
        const minutes = Number.isFinite(retryAfter) && retryAfter > 0
            ? ` Try again in about ${Math.ceil(retryAfter / 60)} minute${retryAfter > 60 ? 's' : ''}.`
            : ' Please try again later.';
        return (detail.message || 'Too many requests.') + minutes;
    }
    if (typeof err?.message === 'string' && err.message && !err.message.includes('Network Error')) {
        return err.message;
    }
    return fallback;
};
import { useAuth } from './useAuth';
import { AuthResponse } from '../services/auth';

export const useLoginForm = (onSuccess: (result?: AuthResponse) => void) => {
    const { login } = useAuth();
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    // Set when the backend refuses this login because the account is already
    // signed in on another device. The form shows the "switch devices?" prompt
    // and only retries once the human confirms.
    const [deviceConflict, setDeviceConflict] = useState<DeviceConflictError | null>(null);
    // Shown after the user picks "Switch to another device": the session did not
    // move, so say so plainly instead of leaving the form silent.
    const [deviceNotice, setDeviceNotice] = useState<string>("");

    const togglePassword = () => {
        setShowPassword(prev => !prev);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeviceConflict(null);
        setDeviceNotice("");
        setIsLoading(true);
        setErrorMessage("");

        try {
            const result = await login(email, password);
            onSuccess(result);
        } catch (err: any) {
            if (err instanceof DeviceConflictError) {
                // Not a credential failure — ask before taking the session away
                // from the device that currently holds it.
                setDeviceConflict(err);
            } else {
                setErrorMessage(formatAuthError(err, "Login failed. Please check your credentials."));
            }
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Confirmed switch: retry the login with forceDeviceSwitch, which signs the
     * other device out and moves the account's live session (and its 6-hour
     * clock) to this one. No extra access pass is used.
     */
    const confirmDeviceSwitch = useCallback(async () => {
        setDeviceConflict(null);
        setDeviceNotice("");
        setIsLoading(true);
        setErrorMessage("");
        try {
            const result = await login(email, password, { forceDeviceSwitch: true });
            onSuccess(result);
        } catch (err: any) {
            if (err instanceof DeviceConflictError) {
                setDeviceConflict(err);
            } else {
                setErrorMessage(formatAuthError(err, "Login failed. Please check your credentials."));
            }
        } finally {
            setIsLoading(false);
        }
    }, [email, password, login, onSuccess]);

    /**
     * "Switch to another device": nothing moves. The account keeps its session
     * on the other device and this one stays signed out, so the choice is
     * spelled out rather than silently dropping the user back on the form.
     */
    const cancelDeviceSwitch = useCallback(() => {
        if (deviceConflict) {
            setDeviceNotice(
                `Nothing changed — this account stays signed in on ${deviceConflict.activeDeviceLabel}. ` +
                'Sign in there with the same credentials, or come back to this device and choose "Stay in this device".',
            );
        }
        setDeviceConflict(null);
    }, [deviceConflict]);

    return {
        email,
        setEmail,
        password,
        setPassword,
        showPassword,
        togglePassword,
        isLoading,
        errorMessage,
        deviceConflict,
        deviceNotice,
        confirmDeviceSwitch,
        cancelDeviceSwitch,
        handleSubmit
    };
};
