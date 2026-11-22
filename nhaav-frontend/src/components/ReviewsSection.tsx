import React from 'react';
import { Review } from '../services/providers';

const M = "'Manrope', sans-serif";

const C = {
  bgCard: 'var(--color-surface)',
  bgLow: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
};

/** Filled stars for a rating, e.g. 4 -> "★★★★☆". */
const stars = (rating: number): string => {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
};

/**
 * Reviews people have left for ONE company, as stored on completed jobs.
 *
 * Everything shown is real: the average, the count and the individual
 * comments. With no reviews yet the section says so instead of showing a
 * flattering placeholder score.
 */
export const ReviewsSection: React.FC<{
  reviews: Review[];
  loading?: boolean;
  title?: string;
  style?: React.CSSProperties;
}> = ({ reviews, loading = false, title = 'Reviews', style }) => {
  const count = reviews.length;
  const average = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  return (
    <section
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '1.5rem',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.1rem', color: C.text, margin: 0 }}>{title}</h2>
        {count > 0 && (
          <span style={{ fontSize: '0.8rem', color: C.muted }}>
            <span style={{ color: '#f59e0b', letterSpacing: '0.05em' }}>{stars(average)}</span>{' '}
            {average.toFixed(1)} · {count} {count === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>Loading reviews…</p>
      ) : count === 0 ? (
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
          No reviews yet. Reviews appear here once customers complete a job and rate it.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {reviews.map((review, i) => (
            <div
              key={review.id}
              style={{ padding: i === 0 ? '0 0 0.9rem' : '0.9rem 0', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: 4 }}>
                <span style={{ color: '#f59e0b', fontSize: '0.85rem', letterSpacing: '0.05em' }}>{stars(review.rating)}</span>
                <span style={{ fontSize: '0.7rem', color: C.dim }}>
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              {review.comment && (
                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, color: C.muted }}>{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ReviewsSection;
