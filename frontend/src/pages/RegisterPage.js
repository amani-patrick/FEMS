import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Flame, Eye, EyeOff, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'technician', label: 'Technician' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'safety_officer', label: 'Safety Officer' },
  { value: 'admin', label: 'Administrator' },
];

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p) => /\d/.test(p), label: 'One number' },
  { test: (p) => /[@$!%*?&_\-#]/.test(p), label: 'One special character (@$!%*?&_-#)' },
];

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: 'technician',
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    // Client-side confirm password check
    if (form.password !== form.confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      login(res.data.data.user, res.data.data.token);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Registration failed'];
      setErrors(errs);
    } finally {
      setLoading(false);
    }
  };

  const passStrength = PASSWORD_RULES.filter(r => r.test(form.password)).length;
  const strengthColor = passStrength <= 2 ? 'var(--danger)' : passStrength <= 3 ? 'var(--warning)' : passStrength === 4 ? 'var(--orange)' : 'var(--success)';
  const strengthLabel = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong'][passStrength];

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <div className="logo-icon"><Flame size={28} /></div>
          <h1>Create Account</h1>
          <p>Fire Extinguisher Management & Compliance System</p>
        </div>

        {errors.length > 0 && (
          <div className="alert alert-error">
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                className="form-control"
                placeholder="John"
                value={form.firstName}
                onChange={set('firstName')}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                className="form-control"
                placeholder="Doe"
                value={form.lastName}
                onChange={set('lastName')}
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              className="form-control"
              placeholder="john.doe@example.com"
              value={form.email}
              onChange={set('email')}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Role *</label>
            <select className="form-control" value={form.role} onChange={set('role')}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-control"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={set('password')}
                required
                style={{ paddingRight: 44 }}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength meter */}
            {form.password && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i <= passStrength ? strengthColor : 'var(--border-light)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</div>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {PASSWORD_RULES.map((r, i) => (
                    <span key={i} style={{ fontSize: 11, color: r.test(form.password) ? 'var(--success)' : 'var(--text-muted)' }}>
                      {r.test(form.password) ? '✓' : '○'} {r.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                className="form-control"
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                required
                style={{
                  paddingRight: 44,
                  borderColor: form.confirmPassword
                    ? form.password === form.confirmPassword ? 'var(--success)' : 'var(--danger)'
                    : undefined,
                }}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.confirmPassword && form.password !== form.confirmPassword && (
              <div className="form-error">Passwords do not match</div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || passStrength < 5 || form.password !== form.confirmPassword}
            style={{ marginTop: 8 }}
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</>
              : <><UserPlus size={16} /> Create Account</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
