import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Flame, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'Uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'Lowercase letter' },
  { test: (p) => /\d/.test(p), label: 'Number' },
  { test: (p) => /[@$!%*?&_\-#]/.test(p), label: 'Special character' },
];

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillEmail = location.state?.email || '';

  const [step, setStep] = useState(1); // 1 = enter email+OTP, 2 = new password
  const [email, setEmail] = useState(prefillEmail);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (step === 1) inputRefs.current[0]?.focus();
  }, [step]);

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return; // digits only
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // only last digit
    setOtp(newOtp);
    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    pasted.split('').forEach((char, i) => { newOtp[i] = char; });
    setOtp(newOtp);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const otpString = otp.join('');
  const otpComplete = otpString.length === 6;

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpComplete) {
      setErrors(['Please enter the complete 6-digit OTP']);
      return;
    }
    setErrors([]);
    setStep(2);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    const passStrength = PASSWORD_RULES.filter(r => r.test(password)).length;
    if (passStrength < 5) {
      setErrors(['Password does not meet all requirements']);
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ email, otp: otpString, newPassword: password });
      toast.success('Password reset successfully!');
      navigate('/login');
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Reset failed'];
      setErrors(errs);
      // If OTP is invalid, go back to step 1
      if (err.response?.status === 400) setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const passStrength = PASSWORD_RULES.filter(r => r.test(password)).length;
  const strengthColor = passStrength <= 2 ? 'var(--danger)' : passStrength <= 3 ? 'var(--warning)' : passStrength === 4 ? 'var(--orange)' : 'var(--success)';

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="logo-icon"><Flame size={28} /></div>
          <h1>Reset Password</h1>
          <p>{step === 1 ? 'Enter the OTP sent to your email' : 'Choose a new password'}</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          {[1, 2].map(s => (
            <React.Fragment key={s}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: step >= s ? 'var(--accent)' : 'var(--bg-hover)',
                color: step >= s ? '#0a0f1e' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {step > s ? '✓' : s}
              </div>
              {s < 2 && <div style={{ flex: 1, height: 2, background: step > s ? 'var(--accent)' : 'var(--border-light)' }} />}
            </React.Fragment>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="alert alert-error">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Step 1: Email + OTP */}
        {step === 1 && (
          <form onSubmit={handleVerifyOtp}>
            {!prefillEmail && (
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">6-Digit OTP *</label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    style={{
                      width: 48, height: 56,
                      textAlign: 'center',
                      fontSize: 24, fontWeight: 700,
                      background: 'var(--bg)',
                      border: `2px solid ${digit ? 'var(--accent)' : 'var(--border-light)'}`,
                      borderRadius: 10,
                      color: 'var(--text)',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                      fontFamily: 'monospace',
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                You can paste the OTP directly
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={!otpComplete || !email}
            >
              <ShieldCheck size={16} /> Verify OTP
            </button>
          </form>
        )}

        {/* Step 2: New password */}
        {step === 2 && (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">New Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 44 }}
                  autoFocus
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: i <= passStrength ? strengthColor : 'var(--border-light)',
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {PASSWORD_RULES.map((r, i) => (
                      <span key={i} style={{ fontSize: 11, color: r.test(password) ? 'var(--success)' : 'var(--text-muted)' }}>
                        {r.test(password) ? '✓' : '○'} {r.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password *</label>
              <input
                type="password"
                className="form-control"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                style={{
                  borderColor: confirmPassword
                    ? password === confirmPassword ? 'var(--success)' : 'var(--danger)'
                    : undefined,
                }}
                autoComplete="new-password"
              />
              {confirmPassword && password !== confirmPassword && (
                <div className="form-error">Passwords do not match</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={loading || passStrength < 5 || password !== confirmPassword}
              >
                {loading
                  ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Resetting…</>
                  : <><ShieldCheck size={15} /> Reset Password</>}
              </button>
            </div>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            <ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
