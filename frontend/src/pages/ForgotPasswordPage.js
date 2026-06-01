import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Mail, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState(null); // shown only in dev mode

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword(email);
      setSent(true);
      // Backend returns OTP in development mode
      if (res.data.otp) {
        setDevOtp(res.data.otp);
      }
      toast.success('OTP sent! Check your email.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <div className="auth-logo">
            <div className="logo-icon" style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'var(--success)', color: 'var(--success)' }}>
              <Mail size={28} />
            </div>
            <h1 style={{ color: 'var(--success)' }}>Check Your Email</h1>
            <p>We sent a 6-digit OTP to <strong>{email}</strong></p>
          </div>

          {devOtp && (
            <div className="alert alert-warning" style={{ textAlign: 'left', marginBottom: 20 }}>
              <div>
                <strong>🛠 Dev Mode — OTP:</strong>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 8, color: 'var(--warning)', marginTop: 8, fontFamily: 'monospace' }}>
                  {devOtp}
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                  This is only shown in development mode. In production, check your email.
                </div>
              </div>
            </div>
          )}

          <Link to="/reset-password" state={{ email }} className="btn btn-primary btn-full btn-lg" style={{ marginBottom: 16 }}>
            Enter OTP & Reset Password
          </Link>

          <button
            className="btn btn-secondary btn-full"
            onClick={() => { setSent(false); setDevOtp(null); }}
          >
            Resend OTP
          </button>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              <ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Back to login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="logo-icon"><Flame size={28} /></div>
          <h1>Forgot Password</h1>
          <p>Enter your email and we'll send you a reset OTP</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              className="form-control"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Sending OTP…</>
              : <><Mail size={16} /> Send Reset OTP</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            <ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
