import { Routes, Route, Navigate } from 'react-router-dom';
import { OnboardingLayout } from './components/layout/OnboardingLayout';
import { MaritimeCredentials } from './pages/onboarding/MaritimeCredentials';
import { VendorRegistration } from './pages/onboarding/VendorRegistration';

// Placeholders for other pages to satisfy routing map
import { PaymentFee } from './pages/onboarding/PaymentFee';
import { KycCompliance } from './pages/onboarding/KycCompliance';

const FinalReview = () => <div className="p-8 text-center"><h1 className="text-headline-md text-primary">Final Review (WIP)</h1></div>;

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/onboarding/credentials" replace />} />
      <Route path="/onboarding" element={<OnboardingLayout />}>
        <Route path="credentials" element={<MaritimeCredentials />} />
        <Route path="fee" element={<PaymentFee />} />
        <Route path="registration" element={<VendorRegistration />} />
        <Route path="kyc" element={<KycCompliance />} />
        <Route path="review" element={<FinalReview />} />
      </Route>
    </Routes>
  );
}

export default App;
