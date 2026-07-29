import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ShieldCheck, Users, Server, Key, Settings, Plus, RefreshCw, FileText } from 'lucide-react';
import { documentsService } from '../../services/documents';

export const AdminPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      const data = await documentsService.getAdminDocuments();
      setDocuments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const users = [
    { name: 'Capt. Alex Vance', role: 'System Admin', email: 'alex@horizon.com', status: 'Active' },
    { name: 'Sarah Jenkins', role: 'Customs Officer', email: 'sarah.j@port.gov', status: 'Active' },
    { name: 'Marcus Brody', role: 'Parser Engineer', email: 'marcus@horizon.com', status: 'Active' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Admin & Engine Control Panel</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>Manage system access, regex parser configs, and API access keys.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />}>Invite Team Member</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
        <Card title="User Access Control" subtitle="Role-based permissions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {users.map((u, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{u.role} &bull; {u.email}</div>
                </div>
                <span className="badge badge-green">{u.status}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Regex Engine Settings" subtitle="Active extraction pipelines">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Country Regex Rule</div>
              <code style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>registered address.*?,\s*([A-Za-z]+)</code>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>IMO Vessel Extractor</div>
              <code style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>IMO\s*:\s*([0-9]{7})</code>
            </div>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />}>Reload Regex Schemas</Button>
          </div>
        </Card>

        <Card title="API Keys & Integration" subtitle="Backend connection tokens">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Production API Key</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '0.25rem' }}>hz_live_99812401827491827</div>
            </div>
            <Button variant="outline" size="sm" icon={<Key size={14} />}>Rotate Secret Keys</Button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <Card title="OCR Documents Review" subtitle="Background extracted data from uploaded documents">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading documents...</div>
          ) : documents.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No documents uploaded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {documents.map((doc: any) => (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', borderLeft: `4px solid ${doc.verification_status === 'extracted' ? 'var(--accent-cyan)' : 'var(--accent-warning)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={18} color="var(--accent-cyan)" />
                      <span style={{ fontWeight: 600 }}>{doc.name || 'Unnamed Document'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', backgroundColor: 'var(--bg-base)', padding: '2px 6px', borderRadius: '4px' }}>
                        {doc.document_type}
                      </span>
                    </div>
                    <span className={`badge ${doc.verification_status === 'extracted' ? 'badge-green' : 'badge-yellow'}`}>
                      {doc.verification_status}
                    </span>
                  </div>
                  
                  {doc.verification_status === 'extracted' && doc.ocr_extracted_data && (
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--bg-base)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        Extracted Fields (Confidence: {Math.round((doc.verification_score || 0) * 100)}%)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                        {Object.entries(doc.ocr_extracted_data.fields || {}).map(([key, value]) => (
                          <div key={key} style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-dim)' }}>{key}: </span>
                            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
