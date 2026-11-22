import React, { useEffect } from 'react';
import { AuthLayout } from '../../components/AuthLayout';
import { LoginForm } from '../../components/LoginForm';

export interface LoginPageProps {}

/**
 * Login page.
 *
 * The backend's transactional emails link to `/login?verify_token=…` and
 * `/login?reset_token=…` (legacy link format kept for compatibility). Those
 * tokens belong to dedicated flows, so this page redirects them immediately —
 * including a bare `?verify_token`/`?reset_token` click — before rendering.
 */
const LoginPage: React.FC<LoginPageProps> = () => {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const verifyToken = params.get('verify_token');
        const resetToken = params.get('reset_token');
        if (verifyToken) {
            window.location.replace(`/verify-email?token=${encodeURIComponent(verifyToken)}`);
        } else if (resetToken) {
            window.location.replace(`/reset-password?token=${encodeURIComponent(resetToken)}`);
        }
    }, []);

    return (
        <AuthLayout
            title="Welcome Back"
            subtitle="Access your maritime command center."
        >
            <LoginForm />
        </AuthLayout>
    );
};

export default LoginPage;
