"use client";

import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import Image from 'next/image';
import { FcGoogle } from 'react-icons/fc';
import { FaApple, FaFacebook } from 'react-icons/fa';

export default function UserManagementModal({ isOpen, onClose, user, onUserChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [availableProviders, setAvailableProviders] = useState({ google: false, apple: false, facebook: false });
  const emailInputRef = useRef(null);

  // Check available social providers
  useEffect(() => {
    const checkProviders = async () => {
      try {
        const response = await fetch('/api/auth/providers');
        const providers = await response.json();
        setAvailableProviders(providers);
      } catch (error) {
        // If API fails, default to no providers
        console.error('Failed to check available providers:', error);
      }
    };
    checkProviders();
  }, []);

  // Check if user is already authenticated
  useEffect(() => {
    if (isOpen) {
      setIsCheckingAuth(true);
      const checkAuth = async () => {
        try {
          const session = await authClient.getSession();
          if (session?.data?.user) {
            setIsAuthenticated(true);
            setIsCheckingAuth(false);
            setEmail(session.data.user.email || '');
          } else {
            setIsAuthenticated(false);
            setIsCheckingAuth(false);
            // Focus email input when modal opens (only if not authenticated)
            // Use multiple attempts to ensure focus works even if chat input tries to steal it
            const focusInput = () => {
              if (emailInputRef.current && document.activeElement !== emailInputRef.current) {
                emailInputRef.current.focus();
                emailInputRef.current.select();
              }
            };
            setTimeout(focusInput, 100);
            setTimeout(focusInput, 300);
            setTimeout(focusInput, 500);
          }
        } catch (error) {
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
          const focusInput = () => {
            if (emailInputRef.current && document.activeElement !== emailInputRef.current) {
              emailInputRef.current.focus();
              emailInputRef.current.select();
            }
          };
          setTimeout(focusInput, 100);
          setTimeout(focusInput, 300);
          setTimeout(focusInput, 500);
        }
      };
      checkAuth();
    } else {
      // Reset state when modal closes
      setShowPasswordReset(false);
      setResetEmail('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  const handleLoginSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Try sign in FIRST (most users already have accounts)
      const signInResult = await authClient.signIn.email({
        email,
        password,
      });
      
      if (signInResult.error) {
        // If sign in fails, check if it's because user doesn't exist
        const errorMsg = signInResult.error.message?.toLowerCase() || '';
        const errorCode = signInResult.error.code || '';
        
        // Only try signup if error clearly indicates user doesn't exist
        const isUserNotFound = errorMsg.includes('not found') || 
                               errorMsg.includes('does not exist') || 
                               errorMsg.includes('user not found') ||
                               errorCode === 'USER_NOT_FOUND';
        
        if (isUserNotFound) {
          // User doesn't exist - try sign up
          const signUpResult = await authClient.signUp.email({
            email,
            password,
          });
          
          if (signUpResult.error) {
            // Sign up also failed - account might exist after all
            // This means password was wrong, show appropriate error
            setError('Invalid email or password. Please check your credentials.');
            setIsLoading(false);
            return;
          }
          // Sign up succeeded - continue
        } else {
          // Sign in failed for other reason (wrong password, etc.)
          // Don't try signup - user exists but credentials are wrong
          setError(signInResult.error.message || 'Invalid email or password. Please check your credentials.');
          setIsLoading(false);
          return;
        }
      }

      // Success (either sign in or sign up) - verify we have a session
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        setError('Authentication failed. Please try again.');
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      if (onUserChange) {
        onUserChange(session.data.user);
      }
      setSuccess('Successfully signed in!');
      setIsLoading(false);
      
      // Close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError('');
    setIsLoading(true);

    try {
      await authClient.signOut();
      setIsAuthenticated(false);
      setEmail('');
      setPassword('');
      if (onUserChange) {
        onUserChange(null);
      }
      setIsLoading(false);
      onClose();
    } catch (err) {
      setError('Failed to sign out. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Better Auth uses forgetPassword (without 't') or requestPasswordReset
      // Try requestPasswordReset first, fallback to direct API call
      let result;
      if (authClient.requestPasswordReset) {
        result = await authClient.requestPasswordReset({
          email: resetEmail,
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } else if (authClient.forgetPassword) {
        result = await authClient.forgetPassword({
          email: resetEmail,
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } else {
        // Direct API call as fallback
        const response = await fetch(`${window.location.origin}/api/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: resetEmail,
            redirectTo: `${window.location.origin}/reset-password`,
          }),
        });
        const data = await response.json();
        result = { data, error: response.ok ? null : data };
      }

      if (result.error) {
        // Handle 404 or other errors gracefully
        if (result.error.message?.includes('404') || result.error.message?.includes('not found')) {
          setError('Password reset is not currently configured. Please contact support for assistance.');
        } else {
          setError(result.error.message || 'Failed to send password reset email.');
        }
        setIsLoading(false);
        return;
      }

      setSuccess('Password reset email sent! Please check your inbox.');
      setIsLoading(false);
      setResetEmail('');
    } catch (err) {
      // Handle network errors or missing endpoints
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setError('Password reset is not currently configured. Please contact support for assistance.');
      } else {
        setError('Network error. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.resetPassword({
        token: resetToken,
        newPassword,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to reset password. Token may be invalid or expired.');
        setIsLoading(false);
        return;
      }

      setSuccess('Password reset successful! You can now sign in with your new password.');
      setIsLoading(false);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordReset(false);
    } catch (err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setError('');
    setIsLoading(true);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
      });

      if (result.error) {
        setError(result.error.message || `Failed to sign in with ${provider}.`);
        setIsLoading(false);
        return;
      }

      // Social login redirects, so we don't need to handle success here
      // The redirect will happen automatically
    } catch (err) {
      setError(`Failed to sign in with ${provider}. Please try again.`);
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-management-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border-2 border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-32 h-32 bg-white rounded-xl shadow-lg flex items-center justify-center p-6 overflow-hidden">
            <div className="w-20 h-20 flex items-center justify-center">
              <Image
                src="/img/icon.png"
                alt="access: chatgpt"
                width={64}
                height={64}
                className="rounded-xl object-contain w-full h-full"
                priority
              />
            </div>
          </div>
        </div>

        {isCheckingAuth ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Checking...</p>
          </div>
        ) : isAuthenticated ? (
          // User is signed in - show account management
          <>
            <h2 
              id="user-management-modal-title"
              className="text-3xl font-bold mb-2 text-gray-900 text-center"
            >
              Account
            </h2>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 text-center mb-4">
                Signed in as: <strong className="text-gray-900">{email}</strong>
              </p>

              {!showPasswordReset ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="w-full bg-gray-100 text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all"
                  >
                    Reset Password
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isLoading}
                    className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? 'Signing out...' : 'Sign Out'}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="text-gray-600 hover:text-gray-800 font-medium text-sm focus:outline-none focus:underline py-2"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <div className="mb-4">
                    <label htmlFor="reset-token" className="block text-sm font-semibold mb-2 text-gray-900">
                      Reset Token (from email)
                    </label>
                    <input
                      id="reset-token"
                      type="text"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      placeholder="Enter token from email"
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="new-password" className="block text-sm font-semibold mb-2 text-gray-900">
                      New Password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>

                  <div className="mb-6">
                    <label htmlFor="confirm-password" className="block text-sm font-semibold mb-2 text-gray-900">
                      Confirm Password
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    />
                  </div>

                  {error && (
                    <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 text-red-800 rounded-lg" role="alert">
                      <strong className="font-semibold">Error:</strong> {error}
                    </div>
                  )}

                  {success && (
                    <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 text-green-800 rounded-lg" role="alert">
                      <strong className="font-semibold">Success:</strong> {success}
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                    >
                      {isLoading ? 'Resetting...' : 'Reset Password'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordReset(false);
                        setResetToken('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setError('');
                        setSuccess('');
                      }}
                      className="text-gray-600 hover:text-gray-800 font-medium text-sm focus:outline-none focus:underline py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {error && !showPasswordReset && (
              <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 text-red-800 rounded-lg" role="alert">
                <strong className="font-semibold">Error:</strong> {error}
              </div>
            )}

            {success && !showPasswordReset && (
              <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 text-green-800 rounded-lg" role="alert">
                <strong className="font-semibold">Success:</strong> {success}
              </div>
            )}
          </>
        ) : (
          // User is not signed in - show login/signup form
          <>
            <h2 
              id="user-management-modal-title"
              className="text-3xl font-bold mb-2 text-gray-900 text-center"
            >
              Sign In
            </h2>
            
            <p className="mb-6 text-sm text-gray-600 text-center">
              Sign in with your social account or email
            </p>

            {!showPasswordReset ? (
              <>
                {/* Social Login - only show if at least one provider is available */}
                {(availableProviders.google || availableProviders.apple || availableProviders.facebook) && (
                  <div className="mb-6">
                    {/* Social Login Buttons - only show configured providers */}
                    <div className={`grid gap-2 mb-4 ${(availableProviders.google ? 1 : 0) + (availableProviders.apple ? 1 : 0) + (availableProviders.facebook ? 1 : 0) === 3 ? 'grid-cols-3' : (availableProviders.google ? 1 : 0) + (availableProviders.apple ? 1 : 0) + (availableProviders.facebook ? 1 : 0) === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {availableProviders.google && (
                        <button
                          type="button"
                          onClick={() => handleSocialLogin('google')}
                          disabled={isLoading}
                          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          title="Sign in with Google"
                        >
                          <FcGoogle className="w-5 h-5" />
                        </button>
                      )}
                      {availableProviders.apple && (
                        <button
                          type="button"
                          onClick={() => handleSocialLogin('apple')}
                          disabled={isLoading}
                          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          title="Sign in with Apple"
                        >
                          <FaApple className="w-5 h-5 text-gray-900" />
                        </button>
                      )}
                      {availableProviders.facebook && (
                        <button
                          type="button"
                          onClick={() => handleSocialLogin('facebook')}
                          disabled={isLoading}
                          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          title="Sign in with Facebook"
                        >
                          <FaFacebook className="w-5 h-5 text-blue-600" />
                        </button>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">Or continue with email/password</span>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleLoginSignup}>
                  <div className="mb-4">
                    <label htmlFor="auth-email" className="block text-sm font-semibold mb-2 text-gray-900">
                      Email
                    </label>
                    <input
                      ref={emailInputRef}
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-lg"
                      aria-required="true"
                      autoComplete="email"
                      autoFocus={!(availableProviders.google || availableProviders.apple || availableProviders.facebook)}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>

                  <div className="mb-6">
                    <label htmlFor="auth-password" className="block text-sm font-semibold mb-2 text-gray-900">
                      Password
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-lg"
                      aria-required="true"
                      autoComplete="current-password"
                    />
                    <p className="text-sm text-gray-600 mt-2">
                      Password must be at least 6 characters
                    </p>
                  </div>

                  {error && (
                    <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 text-red-800 rounded-lg" role="alert">
                      <strong className="font-semibold">Error:</strong> {error}
                    </div>
                  )}

                  {success && (
                    <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 text-green-800 rounded-lg" role="alert">
                      <strong className="font-semibold">Success:</strong> {success}
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                    >
                      {isLoading ? 'Please wait...' : 'Continue'}
                    </button>

                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="text-gray-600 hover:text-gray-800 font-medium text-sm focus:outline-none focus:underline py-2"
                  >
                    Forgot Password?
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="text-gray-600 hover:text-gray-800 font-medium text-sm focus:outline-none focus:underline py-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
              </>
            ) : (
              <form onSubmit={handleRequestPasswordReset}>
                <h3 className="text-xl font-bold mb-4 text-gray-900 text-center">
                  Reset Password
                </h3>
                
                <p className="mb-6 text-sm text-gray-600 text-center">
                  Enter your email address and we'll send you a password reset link.
                </p>

                <div className="mb-6">
                  <label htmlFor="reset-email" className="block text-sm font-semibold mb-2 text-gray-900">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white text-lg"
                    placeholder="your@email.com"
                  />
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 text-red-800 rounded-lg" role="alert">
                    <strong className="font-semibold">Error:</strong> {error}
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 text-green-800 rounded-lg" role="alert">
                    <strong className="font-semibold">Success:</strong> {success}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordReset(false);
                      setResetEmail('');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-gray-600 hover:text-gray-800 font-medium text-sm focus:outline-none focus:underline py-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

