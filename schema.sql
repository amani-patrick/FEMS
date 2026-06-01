-- ============================================================
-- Fire Extinguisher Management and Compliance System (FEMCS)
-- Database Schema - Run once to initialize the database
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'technician'
        CHECK (role IN ('admin', 'technician', 'inspector', 'safety_officer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS TABLE (FR1)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    national_id VARCHAR(50) UNIQUE,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    organization_name VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- FIRE EXTINGUISHERS TABLE (FR2)
-- ============================================================
CREATE TABLE IF NOT EXISTS extinguishers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extinguisher_code VARCHAR(30) UNIQUE NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CO2', 'Dry Powder', 'Foam', 'Water')),
    capacity_liters DECIMAL(8,2) NOT NULL,
    manufacture_date DATE NOT NULL,
    purchase_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    last_inspection_date DATE,
    next_inspection_date DATE,
    location VARCHAR(300) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'serviced', 'decommissioned', 'pending_inspection')),
    compliance_status VARCHAR(30) DEFAULT 'compliant'
        CHECK (compliance_status IN ('compliant', 'non_compliant', 'warning', 'critical')),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INSPECTIONS TABLE (FR5)
-- ============================================================
CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extinguisher_id UUID NOT NULL REFERENCES extinguishers(id) ON DELETE CASCADE,
    inspector_id UUID REFERENCES users(id),
    inspector_name VARCHAR(200) NOT NULL,
    inspection_date DATE NOT NULL,
    findings TEXT,
    status VARCHAR(30) NOT NULL CHECK (status IN ('Passed', 'Requires Service', 'Failed')),
    next_inspection_date DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- MAINTENANCE TABLE (FR6)
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extinguisher_id UUID NOT NULL REFERENCES extinguishers(id) ON DELETE CASCADE,
    service_date DATE NOT NULL,
    service_company VARCHAR(200) NOT NULL,
    technician_name VARCHAR(200) NOT NULL,
    next_service_date DATE,
    cost DECIMAL(12,2) DEFAULT 0.00,
    description TEXT,
    status VARCHAR(30) DEFAULT 'completed'
        CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS TABLE (FR7, FR8)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    extinguisher_id UUID REFERENCES extinguishers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL
        CHECK (type IN ('expiry_alert','inspection_due','service_due','compliance_violation','escalation','general')),
    title VARCHAR(300) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    days_until_expiry INTEGER,
    escalation_stage INTEGER DEFAULT 0,
    recipient_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ESCALATIONS TABLE (FR8)
-- ============================================================
CREATE TABLE IF NOT EXISTS escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extinguisher_id UUID NOT NULL REFERENCES extinguishers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 5),
    reason TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'open'
        CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- OTP TABLE (password reset)
-- ============================================================
CREATE TABLE IF NOT EXISTS otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(30) NOT NULL DEFAULT 'password_reset'
        CHECK (purpose IN ('password_reset', 'email_verify')),
    is_used BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps(expires_at);

-- ============================================================
-- AUDIT LOGS TABLE (FR10)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_extinguishers_code ON extinguishers(extinguisher_code);
CREATE INDEX IF NOT EXISTS idx_extinguishers_serial ON extinguishers(serial_number);
CREATE INDEX IF NOT EXISTS idx_extinguishers_customer ON extinguishers(customer_id);
CREATE INDEX IF NOT EXISTS idx_extinguishers_expiry ON extinguishers(expiry_date);
CREATE INDEX IF NOT EXISTS idx_extinguishers_status ON extinguishers(status);
CREATE INDEX IF NOT EXISTS idx_inspections_extinguisher ON inspections(extinguisher_id);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_extinguisher ON maintenance(extinguisher_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_extinguishers_updated_at BEFORE UPDATE ON extinguishers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_escalations_updated_at BEFORE UPDATE ON escalations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================
-- Default admin user (password: Admin@1234)
-- Hash generated with bcrypt rounds=12
INSERT INTO users (first_name, last_name, email, password, role)
VALUES ('System', 'Admin', 'admin@femcs.rw', '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT (email) DO NOTHING;
