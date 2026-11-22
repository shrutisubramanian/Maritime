import React from 'react';

export const showComingSoon = (e?: React.MouseEvent | React.TouchEvent) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  alert("Coming Soon! This feature is under active development.");
};
