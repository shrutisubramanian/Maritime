import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import LandingPage from '../pages/Landing';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';
import { Marketplace } from '../pages/Marketplace/Marketplace';
import { ServiceDetails } from '../pages/Marketplace/ServiceDetails';
import { ProviderProfile } from '../pages/Marketplace/ProviderProfile';
import { Financials } from '../pages/Financials/Financials';
import { ShipDashboard } from '../pages/Dashboard/ShipDashboard/ShipDashboard';
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
import UploadPage from '../pages/Upload';
import OCRResultPage from '../pages/OCRResult';
import AdminPage from '../pages/Admin';
import ProfilePage from '../pages/Profile';

import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleProtectedRoute } from './RoleProtectedRoute';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/choose-role', element: <RoleSelectionPage /> },
  { path: '/role', element: <RoleSelectionPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Common Routes
      { path: '/marketplace',                element: <Marketplace /> },
      { path: '/service/:providerId/:skill', element: <ServiceDetails /> },
      { path: '/provider/:id',               element: <ProviderProfile /> },
      { path: '/financials',                 element: <Financials /> },
      { path: '/company-profile',            element: <CompanyProfile /> },
      { path: '/notifications',              element: <Notifications /> },
      { path: '/settings',                   element: <Settings /> },
      { path: '/verification',               element: <Verification /> },
      { path: '/analytics',                  element: <AnalyticsDashboard /> },
      { path: '/upload',                     element: <UploadPage /> },

      // Client-only Routes
      {
        element: <RoleProtectedRoute allowedRoles={['client', 'admin']} />,
        children: [
          { path: '/ship-dashboard',             element: <ShipDashboard /> },
          { path: '/ship-owner',                 element: <ShipOwnerDashboard /> },
          { path: '/compare-quotations',         element: <CompareQuotations /> },
          { path: '/create-request',             element: <CreateProcurementRequest /> },
          { path: '/request/:id',                element: <RequestDetails /> },
          { path: '/orders',                     element: <OrdersPage /> },
          { path: '/orders/:id',                 element: <OrderDetails /> },
        ]
      },

      // Provider-only Routes
      {
        element: <RoleProtectedRoute allowedRoles={['provider', 'supplier', 'admin']} />,
        children: [
          { path: '/provider-dashboard',         element: <ProviderDashboard /> },
          { path: '/provider/services',          element: <MyServices /> },
          { path: '/my-quotations',              element: <MyQuotations /> },
          { path: '/my-quotations/:id',          element: <QuotationDetails /> },
          { path: '/submit-quotation',           element: <SubmitQuotation /> },
          { path: '/procurement-opportunities',  element: <ProcurementOpportunities /> },
          { path: '/add-service',                element: <AddService /> },
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
          { path: '/ocr-result',           element: <OCRResultPage /> },
          { path: '/admin',                element: <AdminPage /> },
          { path: '/profile',              element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);






