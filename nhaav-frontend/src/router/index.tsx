import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import LandingPage from '../pages/Landing';
import PricingPage from '../pages/Pricing';
import ServicesPage from '../pages/Services';
import TermsPage from '../pages/Terms';
import AboutPage from '../pages/About';
import ContactPage from '../pages/Contact';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';
import VerifyEmailPage from '../pages/Authentication/VerifyEmail';
import ForgotPasswordPage from '../pages/Authentication/ForgotPassword';
import ResetPasswordPage from '../pages/Authentication/ResetPassword';
import ResendVerificationPage from '../pages/Authentication/ResendVerification';
import { Marketplace } from '../pages/Marketplace/Marketplace';
import { CompanyProfilePage } from '../pages/Marketplace/CompanyProfilePage';
import { ServiceDetails } from '../pages/Marketplace/ServiceDetails';
import { ProviderProfile } from '../pages/Marketplace/ProviderProfile';
import { SuppliesMarketplace } from '../pages/Marketplace/SuppliesMarketplace';
import { SupplyDetails } from '../pages/Marketplace/SupplyDetails';
import { SupplierProfile } from '../pages/Marketplace/SupplierProfile';
import { SupplierDashboard } from '../pages/Dashboard/SupplierDashboard';
import { MyCatalog } from '../pages/Dashboard/SupplierDashboard/MyCatalog';
import { AddListing } from '../pages/Dashboard/SupplierDashboard/AddListing';
import { AnalyticsDashboard } from '../pages/Dashboard/AnalyticsDashboard';
import { ShipOwnerDashboard } from '../pages/Dashboard/ShipOwnerDashboard/ShipOwnerDashboard';
import { ProviderDashboard } from '../pages/Dashboard/ProviderDashboard';
import { Notifications } from '../pages/Notifications/Notifications';
import { CompareQuotations } from '../pages/Procurement/Quotes/CompareQuotations';
import { SubmitQuotation } from '../pages/Procurement/Quotes/SubmitQuotation';
import { ProcurementOpportunities } from '../pages/Procurement/ProcurementRequests/ProcurementOpportunities';
import { AddService } from '../pages/Dashboard/ProviderDashboard/AddService';
import { MyServices } from '../pages/Dashboard/ProviderDashboard/MyServices';
import { MyQuotations } from '../pages/Dashboard/ProviderDashboard/MyQuotations';
import { QuotationDetails } from '../pages/Dashboard/ProviderDashboard/QuotationDetails';
import { Verification } from '../pages/Documents/Verification';
import { CompanyProfile } from '../pages/Profile/CompanyProfile';
import { EditCompanyProfile } from '../pages/Dashboard/ProviderDashboard/EditCompanyProfile';
import { SuccessScreen } from '../components/SuccessScreen';
import { CreateProcurementRequest } from '../pages/Procurement/ProcurementRequests/CreateProcurementRequest';
import { RequestDetails } from '../pages/Procurement/ProcurementRequests/RequestDetails';
import { OrdersPage, OrderDetails } from '../pages/Orders';
import { JobTracking } from '../pages/Dashboard/JobTracking/JobTracking';
import { JobDetails } from '../pages/Dashboard/JobTracking/JobDetails';
import { Settings } from '../pages/Settings';
import RoleSelectionPage from '../pages/Role/chooserole';
import DashboardPage from '../pages/Dashboard';
import AdminPage from '../pages/Admin';
import AdminLogin from '../pages/Admin/AdminLogin';
import ProviderVerification from '../pages/Admin/ProviderVerification';
import MarketplaceServices from '../pages/Admin/MarketplaceServices';
import ProcurementRequests from '../pages/Admin/ProcurementRequests';
import ListingModeration from '../pages/Admin/ListingModeration';
import PendingPayments from '../pages/Admin/PendingPayments';
import ListingFees from '../pages/Admin/ListingFees';
import ProfileVisibility from '../pages/Admin/ProfileVisibility';
import PassUsage from '../pages/Admin/PassUsage';
import AdminProfiles from '../pages/Admin/Profiles';
import AdminDocuments from '../pages/Admin/Documents';
import AdminAccounts from '../pages/Admin/Accounts';
import Payments from '../pages/Payments/Payments';
import ProfilePage from '../pages/Profile';

import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleProtectedRoute } from './RoleProtectedRoute';
import { AdminProtectedRoute } from './AdminProtectedRoute';
import { BrandThemeProvider } from '../context/ThemeContext';
import { SiteShell } from '../layouts/SiteShell';

export const router = createBrowserRouter([
  // Shell renders the app-wide consent bar, which links into /terms, so it has
  // to sit inside the router rather than beside RouterProvider.
  {
    element: <SiteShell />,
    children: [
  // The public brand surfaces are palette-fixed (Morning Dawn ground, Yale
  // Blue panels), so they are wrapped in the brand theme rather than the
  // user's light/dark preference.
  { path: '/', element: <BrandThemeProvider><LandingPage /></BrandThemeProvider> },
  { path: '/choose-role', element: <RoleSelectionPage /> },
  { path: '/role', element: <RoleSelectionPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <BrandThemeProvider><RegisterPage /></BrandThemeProvider> },
  { path: '/pricing', element: <BrandThemeProvider><PricingPage /></BrandThemeProvider> },
  { path: '/services', element: <BrandThemeProvider><ServicesPage /></BrandThemeProvider> },
  { path: '/terms', element: <BrandThemeProvider><TermsPage /></BrandThemeProvider> },
  { path: '/about', element: <BrandThemeProvider><AboutPage /></BrandThemeProvider> },
  { path: '/contact', element: <BrandThemeProvider><ContactPage /></BrandThemeProvider> },
  { path: '/admin/login', element: <AdminLogin /> },
  // Email verification + password reset (public; token comes from the email link)
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/resend-verification', element: <ResendVerificationPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Common Routes
      { path: '/marketplace/:type?',         element: <Marketplace /> },
      // Company-first discovery: a company's business profile.
      { path: '/company/:profileId',          element: <CompanyProfilePage /> },
      { path: '/marketplace/supplies',       element: <SuppliesMarketplace /> },
      { path: '/marketplace/stores',         element: <SuppliesMarketplace /> },
      { path: '/marketplace/service/:category', element: <ServiceDetails /> },
      { path: '/supplies/:id',               element: <SupplyDetails /> },
      { path: '/provider/:id',               element: <ProviderProfile /> },
      { path: '/supplier/:id',               element: <SupplierProfile /> },
      { path: '/company-profile',            element: <CompanyProfile /> },
      { path: '/notifications',              element: <Notifications /> },
      { path: '/payments',                   element: <Payments /> },
      { path: '/settings',                   element: <Settings /> },
      { path: '/verification',               element: <Verification /> },
      { path: '/analytics',                  element: <AnalyticsDashboard /> },

      // Client-only Routes
      {
        element: <RoleProtectedRoute allowedRoles={['client']} />,
        children: [
          { path: '/ship-owner',                 element: <ShipOwnerDashboard /> },
          { path: '/compare-quotations',         element: <CompareQuotations /> },
          { path: '/create-request',             element: <CreateProcurementRequest /> },
          { path: '/request/:id',                element: <RequestDetails /> },
          { path: '/orders',                     element: <OrdersPage /> },
          { path: '/orders/:id',                 element: <OrderDetails /> },
        ]
      },

      // Supplier-only Routes
      {
        element: <RoleProtectedRoute allowedRoles={['supplier']} />,
        children: [
          { path: '/supplier-dashboard',         element: <SupplierDashboard /> },
          { path: '/supplier/catalog',           element: <MyCatalog /> },
          { path: '/supplier/add-listing',       element: <AddListing /> },
        ]
      },

      // Provider-only Routes. A supplier account is not a service provider: these
      // screens load /services/dashboard and /services/mine, which reject that
      // role, so a supplier landing here by URL gets an empty page and 403s.
      {
        element: <RoleProtectedRoute allowedRoles={['provider']} />,
        children: [
          { path: '/provider-dashboard',         element: <ProviderDashboard /> },
          { path: '/provider/services',          element: <MyServices /> },
          { path: '/add-service',                element: <AddService /> },
        ]
      },

      // Provider / Supplier shared Routes
      {
        element: <RoleProtectedRoute allowedRoles={['provider', 'supplier']} />,
        children: [
          { path: '/my-quotations',              element: <MyQuotations /> },
          { path: '/my-quotations/:id',          element: <QuotationDetails /> },
          { path: '/submit-quotation',           element: <SubmitQuotation /> },
          { path: '/procurement-opportunities',  element: <ProcurementOpportunities /> },
          { path: '/jobs',                       element: <JobTracking /> },
          { path: '/jobs/:id',                   element: <JobDetails /> },
        ]
      },

      // Dashboard Layout Routes (Legacy/Common)
      {
        element: <DashboardLayout />,
        children: [
          { path: '/dashboard',            element: <DashboardPage /> },
          { path: '/success',              element: <SuccessScreen /> },
          { path: '/profile/edit',         element: <EditCompanyProfile /> },
          { path: '/profile',              element: <ProfilePage /> },
        ],
      },
    ],
  },

  // Admin-only Routes (separate admin JWT)
  {
    element: <AdminProtectedRoute />,
    children: [
      { path: '/admin',                       element: <AdminPage /> },
      // Two separate approval queues: buyers and vendors (suppliers + service
      // providers) each have their own section of the console.
      { path: '/admin/verification',          element: <ProviderVerification roleScope="client" /> },          { path: '/admin/vendors',               element: <ProviderVerification roleScope="vendor" /> },
      { path: '/admin/documents',              element: <AdminDocuments /> },
          // Every client/vendor profile, read-only.
          { path: '/admin/profiles',              element: <AdminProfiles /> },
      // Onboarding follow-up: who registered and where each account stopped.
      { path: '/admin/accounts',              element: <AdminAccounts /> },
      { path: '/admin/marketplace-services',  element: <MarketplaceServices /> },
      { path: '/admin/moderation',            element: <ListingModeration /> },
      { path: '/admin/procurement',           element: <ProcurementRequests /> },
      { path: '/admin/payments',              element: <PendingPayments /> },
      { path: '/admin/listing-fees',           element: <ListingFees /> },
      // Company-PROFILE visibility payments — a different entitlement from the
      // per-listing showcase fees above, so it keeps its own review queue.
      { path: '/admin/profile-visibility',     element: <ProfileVisibility /> },
      // Who is spending access passes, when, and what remains.
      { path: '/admin/pass-usage',              element: <PassUsage /> },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);






