import React from 'react';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { User, Mail, Shield, Save, Key } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>User Profile & Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>Manage your account credentials, notifications, and preferences.</p>
      </div>

      <Card title="Personal Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', border: '2px solid var(--border-glow)' }}>
              <User size={36} />
            </div>
            <div>
              <Button variant="secondary" size="sm">Change Avatar</Button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>JPG or PNG under 2MB</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input label="Full Name" defaultValue="Capt. Alex Vance" icon={<User size={18} />} />
            <Input label="Email Address" defaultValue="captain@horizonmaritime.com" icon={<Mail size={18} />} />
          </div>

          <Input label="Organization" defaultValue="Horizon Shipping Lines & Terminals" readOnly />

          <Button variant="primary" icon={<Save size={16} />} style={{ width: 'fit-content' }}>
            Save Changes
          </Button>
        </div>
      </Card>

      <Card title="Security & Password">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Input label="Current Password" type="password" placeholder="••••••••••••" icon={<Key size={18} />} />
          <Input label="New Password" type="password" placeholder="Enter new password" icon={<Key size={18} />} />
          <Button variant="outline" icon={<Shield size={16} />} style={{ width: 'fit-content' }}>
            Update Security Credentials
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ProfilePage;
