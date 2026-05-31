-- --  System - Database Schema
-- -- Run this once to initialize the database

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -- Users table
-- CREATE TABLE IF NOT EXISTS users (
--     -- id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     -- first_name VARCHAR(100) NOT NULL,
--     -- last_name VARCHAR(100) NOT NULL,
--     -- email VARCHAR(255) UNIQUE NOT NULL,
--     -- password VARCHAR(255) NOT NULL,
--     -- role VARCHAR(20) NOT NULL DEFAULT 'parking_tenant' CHECK (role IN ('admin', 'parking_tenant')),
--     -- is_active BOOLEAN DEFAULT true,
--     -- created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     -- updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );



-- -- Car entries table
-- CREATE TABLE IF NOT EXISTS car_entries (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     plate_number VARCHAR(20) NOT NULL,
--     parking_code VARCHAR(20) NOT NULL REFERENCES parkings(code),
--     entry_datetime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
--     exit_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
--     charged_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
--     ticket_number VARCHAR(50) UNIQUE NOT NULL,
--     attendant_id UUID REFERENCES users(id),
--     status VARCHAR(20) DEFAULT 'parked' CHECK (status IN ('parked', 'exited')),
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- -- Indexes for performance
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
-- CREATE INDEX IF NOT EXISTS idx_parkings_code ON parkings(code);
-- CREATE INDEX IF NOT EXISTS idx_car_entries_plate ON car_entries(plate_number);
-- CREATE INDEX IF NOT EXISTS idx_car_entries_parking_code ON car_entries(parking_code);
-- CREATE INDEX IF NOT EXISTS idx_car_entries_entry_dt ON car_entries(entry_datetime);
-- CREATE INDEX IF NOT EXISTS idx_car_entries_exit_dt ON car_entries(exit_datetime);
-- CREATE INDEX IF NOT EXISTS idx_car_entries_status ON car_entries(status);

-- -- Trigger to update updated_at
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = NOW();
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_parkings_updated_at BEFORE UPDATE ON parkings
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_car_entries_updated_at BEFORE UPDATE ON car_entries
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -- Seed default admin user (password: Admin@1234)
-- INSERT INTO users (first_name, last_name, email, password, role)
-- VALUES ('System', 'Admin', 'admin@xwzparking.rw', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMlJBU2vMaKl8RXc3zrqQT2hhy', 'admin')
-- ON CONFLICT (email) DO NOTHING;
