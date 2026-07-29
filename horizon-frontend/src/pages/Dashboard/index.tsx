import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { FileText, CheckCircle2, Clock, AlertTriangle, UploadCloud, ArrowUpRight, Cpu, Eye } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const stats = [
    { label: 'Total Parsed Documents', value: '1,482', change: '+14%', icon: <FileText size={20} style={{ color: 'var(--accent-primary)' }} /> },
    { label: 'Extraction Accuracy Rate', value: '99.4%', change: '+0.8%', icon: <CheckCircle2 size={20} style={{ color: 'var(--accent-emerald)' }} /> },
    { label: 'Avg OCR Latency', value: '380ms', change: '-45ms', icon: <Clock size={20} style={{ color: 'var(--accent-cyan)' }} /> },
    { label: 'Flagged Exceptions', value: '3', change: '-2', icon: <AlertTriangle size={20} style={{ color: 'var(--accent-amber)' }} /> },
  ];

  const recentDocs = [
    { id: 'INV-2026-0891', type: 'Commercial Invoice', vessel: 'MV Pacific Horizon', status: 'Parsed', date: '10 mins ago', confidence: '99.8%' },
    { id: 'NOPE-2026-0412', type: 'Non-PE Declaration', vessel: 'Ever Given Container', status: 'Parsed', date: '35 mins ago', confidence: '98.5%' },
    { id: 'BOL-9921-7711', type: 'Bill of Lading', vessel: 'CMA CGM Antoine', status: 'Review Needed', date: '2 hours ago', confidence: '92.1%' },
    { id: 'INV-2026-0888', type: 'Commercial Invoice', vessel: 'MSC Isabella', status: 'Parsed', date: '4 hours ago', confidence: '100%' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>Maritime OCR Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>Real-time telemetry and OCR extraction metrics across port operations.</p>
        </div>
        <Button variant="primary" icon={<UploadCloud size={18} />} onClick={() => navigate('/upload')}>
          Upload New Document
        </Button>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {stats.map((stat, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</span>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>{stat.value}</h2>
              </div>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)' }}>
                {stat.icon}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.775rem', marginTop: '0.5rem', color: 'var(--accent-emerald)' }}>
              <ArrowUpRight size={14} /> {stat.change} vs last month
            </div>
          </Card>
        ))}
      </div>

      {/* Parser Engine Status & Recent Uploads */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Recent Documents Table */}
        <Card title="Recent Parsed Documents" subtitle="Latest OCR extractions processed by Horizon backend">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Document ID</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Vessel</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Confidence</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{doc.id}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{doc.type}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{doc.vessel}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{doc.confidence}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span className={doc.status === 'Parsed' ? 'badge badge-green' : 'badge badge-amber'}>
                        {doc.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => navigate('/ocr-result')}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Active Parsers Side Card */}
        <Card title="Active Parser Engines" subtitle="Extractor status & regex health">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Cpu size={20} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Invoice Parser</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>invoice_parser.py</div>
                </div>
              </div>
              <span className="badge badge-green">ACTIVE</span>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Cpu size={20} style={{ color: 'var(--accent-cyan)' }} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Non-PE Extractor</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>no_pe_parser.py</div>
                </div>
              </div>
              <span className="badge badge-green">ACTIVE</span>
            </div>

            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Cpu size={20} style={{ color: 'var(--accent-purple)' }} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Bill of Lading Regex</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>bol_extractor.py</div>
                </div>
              </div>
              <span className="badge badge-blue">READY</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
