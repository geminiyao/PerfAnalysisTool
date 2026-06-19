import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/** 旧路由重定向 — 保留书签兼容, 侧栏已隐藏。 */
const LegacyRedirect: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  const target = location.search ? `${to}${location.search}` : to;
  return <Navigate to={target} replace />;
};

export default LegacyRedirect;
