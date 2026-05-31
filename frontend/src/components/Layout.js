import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ParkingCircle, Car, BarChart3,
  Users, LogOut, ChevronRight, Activity
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, all: true }
];
const adminItems = [
  // { path: '/reports', label: 'Reports', icon: BarChart3 },
  // { path: '/users', label: 'Users', icon: Users },
];

export default function Layout() {
  // define system layout 
}
