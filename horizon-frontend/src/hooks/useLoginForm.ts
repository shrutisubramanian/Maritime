import { useState } from 'react';
import { useAuth } from './useAuth';

export const useLoginForm = (onSuccess: () => void) => {
    const { login } = useAuth();
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const togglePassword = () => {
        setShowPassword(prev => !prev);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage("");

        try {
            await login(email, password);
            onSuccess();
        } catch (err: any) {
            setErrorMessage(
                err?.response?.data?.detail || err?.message || "Login failed. Please check your credentials."
            );
        } finally {
            setIsLoading(false);
        }
    };

    return {
        email,
        setEmail,
        password,
        setPassword,
        showPassword,
        togglePassword,
        isLoading,
        errorMessage,
        handleSubmit
    };
};
