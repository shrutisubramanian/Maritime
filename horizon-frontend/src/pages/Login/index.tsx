import React from 'react';
import { AuthLayout } from '../../components/AuthLayout';
import { LoginForm } from '../../components/LoginForm';

export interface LoginPageProps {}

const LoginPage: React.FC<LoginPageProps> = () => {
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