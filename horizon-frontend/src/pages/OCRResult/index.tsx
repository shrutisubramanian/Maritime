import React, { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { FileCheck, Download, Code, CheckCircle2, AlertCircle, Copy, FileText } from 'lucide-react';

export const OCRResultPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fields' | 'json'>('fields');
  const [copied, setCopied] = useState(false);

  const parsedData = {
    document_id: 'INV-2026-0891',
    document_type: 'Commercial Maritime Invoice',
    vessel_name: 'MV Pacific Horizon',
    imo_number: '9812736',
    voyage_number: 'VY-2026-04A',
    registered_address: '742 Shipping Way, Singapore 018989',
    extracted_country: 'Singapore',
    shipper: 'Horizon Logistics Global Ltd',
    consignee: 'Apex Port Terminals Inc',
    total_amount: '$48,500.00 USD',
    tax_identifier: 'SG-99812401',
    confidence_score: 0.998,
    parser_used: 'invoice_parser.py (Regex Engine)'
  };

  const jsonString = JSON.stringify(parsedData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-green">OCR Verified</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>INV-2026-0891</span>
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>OCR Extraction Results</h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" icon={<Copy size={16} />} onClick={handleCopy}>
            {copied ? 'Copied JSON!' : 'Copy JSON'}
          </Button>
          <Button variant="primary" icon={<Download size={16} />}>
            Export Result
          </Button>
        </div>
      </div>

      {/* Main Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Document Preview Pane */}
        <Card title="Source Document Preview" subtitle="Target PDF page rendering with extraction highlights">
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', height: '540px', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '1.5rem' }}>
            <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.6)', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
              100% Zoom
            </div>
            <FileText size={64} style={{ color: 'var(--text-dim)', marginBottom: '1rem' }} />
            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Commercial_Invoice_MV_Pacific_Horizon.pdf</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Parsed 1 page, 32 bounding boxes detected</span>
          </div>
        </Card>

        {/* Extracted Fields / JSON Pane */}
        <Card
          title="Extracted Entities & Metadata"
          action={
            <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'var(--bg-surface)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => setActiveTab('fields')}
                style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: 'none', background: activeTab === 'fields' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'fields' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                Key-Values
              </button>
              <button
                onClick={() => setActiveTab('json')}
                style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: 'none', background: activeTab === 'json' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'json' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                JSON Schema
              </button>
            </div>
          }
        >
          {activeTab === 'fields' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '480px', overflowY: 'auto' }}>
              {Object.entries(parsedData).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, display: 'block' }}>
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {val}
                    </span>
                  </div>
                  <CheckCircle2 size={18} style={{ color: 'var(--accent-emerald)' }} />
                </div>
              ))}
            </div>
          ) : (
            <pre style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.825rem', height: '480px', overflow: 'auto' }}>
              {jsonString}
            </pre>
          )}
        </Card>
      </div>
    </div>
  );
};

export default OCRResultPage;
